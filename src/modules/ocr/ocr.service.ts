import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as path from 'path';
import * as fs from 'fs';
import { CategoryDetectionService } from './category-detection.service';

export interface OcrResult {
  vendorName?: string;
  vendorTrn?: string;
  invoiceNumber?: string;
  amount?: number;
  vatAmount?: number;
  expenseDate?: string;
  description?: string;
  suggestedCategoryId?: string; // Auto-detected category ID
  fields: Record<string, any>;
  confidence: number;
}

@Injectable()
export class OcrService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => CategoryDetectionService))
    private readonly categoryDetectionService: CategoryDetectionService,
  ) {}

  async process(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    const provider = this.configService.get<string>('OCR_PROVIDER', 'mock');

    // Check if file is PDF
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    switch (provider.toLowerCase()) {
      case 'google':
        if (isPdf) {
          return this.processPdfWithGoogleVision(file, organizationId);
        }
        return this.processWithGoogleVision(file, organizationId);
      case 'azure':
        return this.processWithAzureFormRecognizer(file, organizationId);
      default:
        return this.processMock(file, organizationId);
    }
  }

  private async processMock(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    // Mock implementation for development/testing
    // In production, replace with actual OCR service
    const now = new Date();

    // Try to extract basic info from filename
    const fileName = file.originalname.toLowerCase();
    let vendorName = 'Unknown Vendor';
    let amount = 0;

    // Simple pattern matching from filename
    if (fileName.includes('starbucks') || fileName.includes('coffee')) {
      vendorName = 'Starbucks';
      amount = 25;
    } else if (fileName.includes('uber') || fileName.includes('taxi')) {
      vendorName = 'Uber';
      amount = 45;
    } else if (fileName.includes('amazon')) {
      vendorName = 'Amazon';
      amount = 150;
    } else if (
      fileName.includes('petrol') ||
      fileName.includes('fuel') ||
      fileName.includes('gas')
    ) {
      vendorName = 'Petrol Station';
      amount = 100;
    }

    // Detect category if organizationId is provided
    let suggestedCategoryId: string | undefined;
    if (organizationId) {
      const mockText = `Receipt from ${vendorName} for ${amount} AED`;
      const detectedCategory =
        await this.categoryDetectionService.detectCategory(
          mockText,
          organizationId,
        );
      if (detectedCategory) {
        suggestedCategoryId = detectedCategory.id;
      }
    }

    return {
      vendorName,
      invoiceNumber: `INV-${now.getTime()}`,
      amount,
      vatAmount: amount * 0.05, // 5% VAT
      expenseDate: now.toISOString().substring(0, 10),
      description: `Uploaded file: ${file.originalname}`,
      suggestedCategoryId,
      confidence: 0.65, // Lower confidence for mock
      fields: {
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        provider: 'mock',
        note: 'Mock OCR - Configure GOOGLE_VISION_API_KEY or AZURE_FORM_RECOGNIZER_KEY for real OCR',
      },
    };
  }

  private async processWithGoogleVision(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    let credentials: any = null;
    try {
      // Get credentials from environment variable (base64 encoded or raw JSON)
      // Priority: GOOGLE_CREDENTIALS_BASE64 > GOOGLE_CREDENTIALS_JSON > GOOGLE_APPLICATION_CREDENTIALS (file path)

      const credentialsBase64 = this.configService.get<string>(
        'GOOGLE_CREDENTIALS_BASE64',
      );
      const credentialsJson = this.configService.get<string>(
        'GOOGLE_CREDENTIALS_JSON',
      );
      const credentialsPath = this.configService.get<string>(
        'GOOGLE_APPLICATION_CREDENTIALS',
      );

      if (credentialsBase64) {
        // Decode base64 encoded credentials
        try {
          const decoded = Buffer.from(credentialsBase64, 'base64').toString(
            'utf-8',
          );
          credentials = JSON.parse(decoded);
        } catch (error) {
          console.error('Error decoding GOOGLE_CREDENTIALS_BASE64:', error);
          throw new Error(
            'Invalid GOOGLE_CREDENTIALS_BASE64 format. Must be base64 encoded JSON.',
          );
        }
      } else if (credentialsJson) {
        // Parse raw JSON string
        try {
          credentials = JSON.parse(credentialsJson);
        } catch (error) {
          console.error('Error parsing GOOGLE_CREDENTIALS_JSON:', error);
          throw new Error(
            'Invalid GOOGLE_CREDENTIALS_JSON format. Must be valid JSON.',
          );
        }
      } else if (credentialsPath) {
        // Fallback to file path (for backward compatibility)
        if (fs.existsSync(credentialsPath)) {
          const fileContent = fs.readFileSync(credentialsPath, 'utf-8');
          credentials = JSON.parse(fileContent);
        } else {
          throw new Error(
            `Google credentials file not found at: ${credentialsPath}`,
          );
        }
      } else {
        // Try default location as last resort
        const defaultPath = path.join(process.cwd(), 'google-credentials.json');
        if (fs.existsSync(defaultPath)) {
          const fileContent = fs.readFileSync(defaultPath, 'utf-8');
          credentials = JSON.parse(fileContent);
        } else {
          throw new Error(
            'Google credentials not configured. Set GOOGLE_CREDENTIALS_BASE64, GOOGLE_CREDENTIALS_JSON, or GOOGLE_APPLICATION_CREDENTIALS environment variable.',
          );
        }
      }

      // Validate credentials structure
      if (
        !credentials ||
        !credentials.type ||
        !credentials.project_id ||
        !credentials.private_key ||
        !credentials.client_email
      ) {
        throw new Error(
          'Invalid Google credentials format. Missing required fields.',
        );
      }

      // Fix private key formatting if it has escaped newlines
      if (
        credentials.private_key &&
        typeof credentials.private_key === 'string'
      ) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      // Initialize Google Vision client with credentials object
      // Try using keyFilename first (if file exists), otherwise use credentials object
      const credsFilePath = this.configService.get<string>(
        'GOOGLE_APPLICATION_CREDENTIALS',
      );
      const defaultCredsPath = path.join(
        process.cwd(),
        'google-credentials.json',
      );

      let client: ImageAnnotatorClient;
      if (credsFilePath && fs.existsSync(credsFilePath)) {
        // Use file path if available (preferred method)
        client = new ImageAnnotatorClient({
          keyFilename: credsFilePath,
          projectId: credentials.project_id,
        });
      } else if (fs.existsSync(defaultCredsPath)) {
        // Use default file path
        client = new ImageAnnotatorClient({
          keyFilename: defaultCredsPath,
          projectId: credentials.project_id,
        });
      } else {
        // Use credentials object directly
        client = new ImageAnnotatorClient({
          credentials: credentials,
          projectId: credentials.project_id,
        });
      }

      // Perform text detection on the image or PDF
      // Note: Google Vision API textDetection supports both images and PDFs
      // For PDFs, it processes the first page or converts PDF to images
      const [result] = await client.textDetection({
        image: { content: file.buffer },
      });

      const detections = result.textAnnotations;
      if (!detections || detections.length === 0) {
        const fileType = file.mimetype === 'application/pdf' ? 'PDF' : 'image';
        console.warn(`No text detected in ${fileType}. Falling back to mock.`);
        return this.processMock(file, organizationId);
      }

      // Extract full text (first detection contains all text)
      const fullText = detections[0]?.description || '';
      const confidence = detections[0]?.confidence || 0.8;

      // Parse extracted text to find vendor, amount, date, etc.
      const parsed = this.parseOcrText(fullText);

      // Create description from full text, excluding already extracted fields
      const description = this.buildDescription(fullText, parsed);

      // Detect category if organizationId is provided
      let suggestedCategoryId: string | undefined;
      if (organizationId) {
        const detectedCategory =
          await this.categoryDetectionService.detectCategoryWithAI(
            fullText,
            parsed.vendorName,
            organizationId,
          );
        if (detectedCategory) {
          suggestedCategoryId = detectedCategory.id;
        }
      }

      return {
        vendorName: parsed.vendorName,
        vendorTrn: parsed.vendorTrn,
        invoiceNumber: parsed.invoiceNumber,
        amount: parsed.amount,
        vatAmount: parsed.vatAmount,
        expenseDate:
          parsed.expenseDate || new Date().toISOString().substring(0, 10),
        description: description,
        suggestedCategoryId,
        confidence: confidence,
        fields: {
          fullText: fullText.substring(0, 500), // Limit text length
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          provider: 'google',
          textAnnotations: detections.length,
        },
      };
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      const errorCode = error?.code;

      console.error('Error processing with Google Vision:', {
        message: errorMessage,
        code: errorCode,
        details: error?.details,
      });

      // Provide helpful error messages for common issues
      if (errorCode === 16 || errorMessage.includes('UNAUTHENTICATED')) {
        const serviceAccountEmail = credentials?.client_email || 'unknown';
        console.error(
          'Google Vision API authentication failed. Please check:\n' +
            '1. Service account credentials are valid and not expired\n' +
            '2. Vision API is enabled in Google Cloud Console\n' +
            '3. Service account has "Cloud Vision API User" role\n' +
            '4. Credentials JSON is properly formatted\n' +
            `Service account email: ${serviceAccountEmail}`,
        );
      }

      console.warn('Falling back to mock OCR.');
      return this.processMock(file, organizationId);
    }
  }

  /**
   * Process PDF files with Google Vision API
   * Note: Google Vision API's textDetection can handle PDFs, but for better results
   * with multi-page PDFs, asyncBatchAnnotateFiles is recommended (async operation)
   * For now, we use the same textDetection method which works for single-page PDFs
   * or the first page of multi-page PDFs
   */
  private async processPdfWithGoogleVision(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    // For PDFs, we can use the same processWithGoogleVision method
    // Google Vision API textDetection supports PDFs, though results may vary
    // For production, consider implementing asyncBatchAnnotateFiles for better PDF support
    console.log('[OCR] Processing PDF file with Google Vision API');
    return this.processWithGoogleVision(file, organizationId);
  }

  private parseOcrText(text: string): {
    vendorName?: string;
    vendorTrn?: string;
    invoiceNumber?: string;
    amount?: number;
    vatAmount?: number;
    expenseDate?: string;
  } {
    const result: {
      vendorName?: string;
      vendorTrn?: string;
      invoiceNumber?: string;
      amount?: number;
      vatAmount?: number;
      expenseDate?: string;
    } = {};

    // Extract vendor name (usually at the top of the receipt)
    const allLines = text.split('\n');
    const nonEmptyLines = allLines.filter((line) => line.trim().length > 0);
    if (nonEmptyLines.length > 0) {
      // Skip common header lines
      const skipPatterns = [
        /^[\d\s\-]+$/,
        /^(street|avenue|road|city|state|zip)/i,
      ];
      for (const line of nonEmptyLines) {
        const trimmed = line.trim();
        if (trimmed.length > 2 && !skipPatterns.some((p) => p.test(trimmed))) {
          result.vendorName = trimmed.substring(0, 100);
          break;
        }
      }
    }

    // Extract invoice number (look for patterns like INV-123, #12345, BILL ID, etc.)
    const invoicePatterns = [
      /(?:invoice|inv|receipt|bill)[\s#:]*([A-Z0-9\-]+)/i,
      /(?:bill\s*id|invoice\s*no|receipt\s*no)[\s:]*([A-Z0-9\-]+)/i,
      /#\s*([A-Z0-9\-]+)/i,
      /(?:no|number)[\s:]*([A-Z0-9\-]+)/i,
    ];
    for (const pattern of invoicePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.invoiceNumber = match[1];
        break;
      }
    }

    // Extract TRN (Tax Registration Number) - UAE format is typically 15 digits
    const trnPatterns = [
      /(?:trn|tax\s*registration\s*number|vat\s*number|tax\s*id)[\s:]*([A-Z0-9]{10,20})/i,
      /(?:registration\s*no|reg\s*no)[\s:]*([A-Z0-9]{10,20})/i,
      /\b([0-Z]{15})\b/, // UAE TRN is typically 15 alphanumeric characters
      /TRN[\s:]*([A-Z0-9]{10,20})/i,
    ];
    for (const pattern of trnPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        // Validate TRN format (UAE TRN is typically 15 characters, alphanumeric)
        const trn = match[1].trim();
        if (trn.length >= 10 && trn.length <= 20 && /^[A-Z0-9]+$/i.test(trn)) {
          result.vendorTrn = trn.toUpperCase();
          break;
        }
      }
    }

    // Extract amounts - improved patterns to handle various formats
    // First, try to find "Total" and get the amount on same or next line
    let totalAmount: number | null = null;

    // Look for "Total" line and get amount from same or next line
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (/^total\s*[:\s]*$/i.test(line)) {
        // Total is on this line, amount might be on next line
        if (i + 1 < allLines.length) {
          const nextLine = allLines[i + 1].trim();
          const amountMatch = nextLine.match(/^([\d,]+\.?\d*)$/);
          if (amountMatch) {
            totalAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
            break;
          }
        }
      } else if (/^total\s*[:\s]*([\d,]+\.?\d*)/i.test(line)) {
        // Total and amount on same line
        const match = line.match(/^total\s*[:\s]*([\d,]+\.?\d*)/i);
        if (match && match[1]) {
          totalAmount = parseFloat(match[1].replace(/,/g, ''));
          break;
        }
      }
    }

    // If not found, use regex patterns
    const amountPatterns = [
      // Total with currency: "Total AED 120.00" or "Total: 120.00"
      /(?:^|\n)\s*total\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
      // Amount line: "AMOUNT 120.00" or "Amount: 120.00"
      /(?:^|\n)\s*amount\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
      // Currency patterns: "AED 120.00" or "$120.00"
      /(?:AED|USD|\$|€|£)\s*([\d,]+\.?\d*)/gi,
    ];

    const amounts: number[] = [];
    if (totalAmount !== null) {
      amounts.push(totalAmount);
    }

    for (const pattern of amountPatterns) {
      try {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            // Reasonable upper limit
            amounts.push(amount);
          }
        }
      } catch (error) {
        // Fallback: use match() if matchAll fails
        const match = text.match(pattern);
        if (match && match[1]) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            amounts.push(amount);
          }
        }
      }
    }

    if (amounts.length > 0) {
      // Use the largest amount as total (usually the final total)
      result.amount = Math.max(...amounts);

      // Try to find VAT/Tax - improved patterns
      const vatPatterns = [
        // "Tax (5.00%)" or "VAT: 5.00"
        /(?:vat|tax)[\s:]*\(?(\d+\.?\d*)%\)?/i,
        // "Tax: AED 5.00" or "VAT 5.00"
        /(?:vat|tax)[\s:]*AED?\s*([\d,]+\.?\d*)/i,
        // Look for tax amount on separate line after "Tax" keyword
        /(?:^|\n)\s*(?:vat|tax)\s*[:\s]*\n?\s*([\d,]+\.?\d*)/gi,
        // Percentage format: "Tax (0.00%)" - extract percentage and calculate
        /(?:vat|tax)\s*\((\d+\.?\d*)%\)/i,
      ];

      let vatFound = false;
      for (const vatPattern of vatPatterns) {
        const vatMatch = text.match(vatPattern);
        if (vatMatch && vatMatch[1]) {
          const vatValue = parseFloat(vatMatch[1].replace(/,/g, ''));
          if (!isNaN(vatValue)) {
            // If it's a percentage (likely < 100), calculate from total
            if (vatValue < 100 && vatValue > 0) {
              result.vatAmount = (result.amount * vatValue) / 100;
            } else {
              // It's an absolute amount
              result.vatAmount = vatValue;
            }
            vatFound = true;
            break;
          }
        }
      }

      // If VAT not found, look for "0.00" on tax line or estimate
      if (!vatFound) {
        // Check for "Tax (0.00%)" or "0.00" on tax line
        const zeroTaxPattern = /(?:vat|tax)[\s:]*\(?0\.?0*%?\)?/i;
        if (zeroTaxPattern.test(text)) {
          result.vatAmount = 0;
        } else {
          // Also check if there's a "0.00" value on a line after "Tax"
          for (let i = 0; i < allLines.length; i++) {
            const line = allLines[i].trim();
            if (
              /^(?:vat|tax)\s*[:\s]*$/i.test(line) &&
              i + 1 < allLines.length
            ) {
              const nextLine = allLines[i + 1].trim();
              const zeroMatch = nextLine.match(/^0\.?0*$/);
              if (zeroMatch) {
                result.vatAmount = 0;
                vatFound = true;
                break;
              }
            }
          }

          if (!vatFound) {
            // Estimate VAT as 5% if not found (UAE standard)
            result.vatAmount = result.amount * 0.05;
          }
        }
      }
    }

    // Extract date - improved patterns to handle various formats
    const datePatterns = [
      // "Date: October 1, 2024" or "Date: Oct 1, 2024"
      /(?:date|dated?)[\s:]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      // "October 1, 2024" standalone
      /([A-Za-z]+\s+\d{1,2},?\s+\d{4})/,
      // "1 October 2024" or "1 Oct 2024"
      /(\d{1,2}\s+[A-Za-z]+\s+\d{4})/,
      // Standard formats: "10/01/2024" or "2024-10-01"
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
      /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        try {
          // Try parsing the date
          const dateStr = match[1].trim();
          let date: Date | null = null;

          // Handle "October 1, 2024" or "Oct 1, 2024" format first
          const monthNameMatch = dateStr.match(
            /([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/,
          );
          if (monthNameMatch) {
            const monthNames: Record<string, number> = {
              january: 0,
              jan: 0,
              february: 1,
              feb: 1,
              march: 2,
              mar: 2,
              april: 3,
              apr: 3,
              may: 4,
              june: 5,
              jun: 5,
              july: 6,
              jul: 6,
              august: 7,
              aug: 7,
              september: 8,
              sep: 8,
              sept: 8,
              october: 9,
              oct: 9,
              november: 10,
              nov: 10,
              december: 11,
              dec: 11,
            };
            const month = monthNames[monthNameMatch[1].toLowerCase()];
            if (month !== undefined) {
              const day = parseInt(monthNameMatch[2]);
              const year = parseInt(monthNameMatch[3]);
              // Use UTC to avoid timezone issues - create date at midnight UTC
              date = new Date(Date.UTC(year, month, day));
            }
          }

          // Handle "1 October 2024" format
          if (!date) {
            const dayMonthYearMatch = dateStr.match(
              /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/,
            );
            if (dayMonthYearMatch) {
              const monthNames: Record<string, number> = {
                january: 0,
                jan: 0,
                february: 1,
                feb: 1,
                march: 2,
                mar: 2,
                april: 3,
                apr: 3,
                may: 4,
                june: 5,
                jun: 5,
                july: 6,
                jul: 6,
                august: 7,
                aug: 7,
                september: 8,
                sep: 8,
                sept: 8,
                october: 9,
                oct: 9,
                november: 10,
                nov: 10,
                december: 11,
                dec: 11,
              };
              const month = monthNames[dayMonthYearMatch[2].toLowerCase()];
              if (month !== undefined) {
                const day = parseInt(dayMonthYearMatch[1]);
                const year = parseInt(dayMonthYearMatch[3]);
                date = new Date(Date.UTC(year, month, day));
              }
            }
          }

          // Handle standard formats: "10/01/2024" or "2024-10-01"
          if (!date) {
            const standardMatch = dateStr.match(
              /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
            );
            if (standardMatch) {
              let day: number, month: number, year: number;
              // Check if it's YYYY-MM-DD format
              if (
                standardMatch[3].length === 4 &&
                parseInt(standardMatch[1]) > 12
              ) {
                year = parseInt(standardMatch[1]);
                month = parseInt(standardMatch[2]) - 1; // Month is 0-indexed
                day = parseInt(standardMatch[3]);
              } else {
                // MM/DD/YYYY or DD/MM/YYYY format
                const first = parseInt(standardMatch[1]);
                const second = parseInt(standardMatch[2]);
                const yearStr = standardMatch[3];
                const year =
                  yearStr.length === 2
                    ? 2000 + parseInt(yearStr)
                    : parseInt(yearStr);

                // Try to determine format - if first > 12, it's likely DD/MM
                if (first > 12) {
                  day = first;
                  month = second - 1;
                } else {
                  // Assume MM/DD format
                  month = first - 1;
                  day = second;
                }
              }
              date = new Date(Date.UTC(year, month, day));
            }
          }

          // Fallback to standard Date parsing
          if (!date) {
            date = new Date(dateStr);
            // If date parsing resulted in timezone shift, try to correct it
            if (!isNaN(date.getTime())) {
              // Reconstruct using UTC to avoid timezone issues
              const year = date.getFullYear();
              const month = date.getMonth();
              const day = date.getDate();
              date = new Date(Date.UTC(year, month, day));
            }
          }

          if (
            date &&
            !isNaN(date.getTime()) &&
            date.getFullYear() > 2000 &&
            date.getFullYear() < 2100
          ) {
            // Format as YYYY-MM-DD using UTC to avoid timezone shifts
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            result.expenseDate = `${year}-${month}-${day}`;
            break;
          }
        } catch (e) {
          // Invalid date, continue
        }
      }
    }

    return result;
  }

  private buildDescription(
    fullText: string,
    parsed: {
      vendorName?: string;
      vendorTrn?: string;
      invoiceNumber?: string;
      amount?: number;
      vatAmount?: number;
      expenseDate?: string;
    },
  ): string {
    // Clean up the text and remove already extracted information
    let description = fullText.trim();

    // Remove vendor name if it appears at the start
    if (parsed.vendorName) {
      const vendorRegex = new RegExp(
        `^${parsed.vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\\n`,
        'i',
      );
      description = description.replace(vendorRegex, '');
    }

    // Remove invoice number patterns
    if (parsed.invoiceNumber) {
      const invoicePatterns = [
        new RegExp(
          `(?:invoice|inv|receipt|bill|bill\\s*id)[\\s#:]*${parsed.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\\n`,
          'gi',
        ),
        new RegExp(
          `#\\s*${parsed.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\\n`,
          'gi',
        ),
      ];
      invoicePatterns.forEach((pattern) => {
        description = description.replace(pattern, '');
      });
    }

    // Remove date patterns
    if (parsed.expenseDate) {
      const datePatterns = [
        /(?:date|dated?)[\s:]*[\d\/\-\w\s,]+/gi,
        /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g,
        /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g,
        /[A-Za-z]+\s+\d{1,2},?\s+\d{4}/g,
      ];
      datePatterns.forEach((pattern) => {
        description = description.replace(pattern, '');
      });
    }

    // Remove amount patterns (but keep other numbers that might be useful)
    if (parsed.amount !== undefined) {
      const amountStr = parsed.amount.toString();
      // Remove exact total amount matches
      const totalPattern = new RegExp(
        `(?:^|\\n)\\s*total\\s*[:\\s]*(?:AED\\s*)?${amountStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\\n`,
        'gi',
      );
      description = description.replace(totalPattern, '');
    }

    // Remove VAT/Tax lines
    const taxPatterns = [
      /(?:vat|tax)[\s:]*\(?[\d.]+%?\)?.*?\n/gi,
      /(?:vat|tax)[\s:]*AED?\s*[\d,]+\.?\d*.*?\n/gi,
    ];
    taxPatterns.forEach((pattern) => {
      description = description.replace(pattern, '');
    });

    // Clean up multiple newlines and trim
    description = description
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/^\s+|\s+$/gm, '') // Trim each line
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();

    // Limit description length (keep first 2000 characters)
    if (description.length > 2000) {
      description = description.substring(0, 2000) + '...';
    }

    return description || fullText.substring(0, 500); // Fallback to first 500 chars if cleaned text is empty
  }

  private async processWithAzureFormRecognizer(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    const endpoint = this.configService.get<string>(
      'AZURE_FORM_RECOGNIZER_ENDPOINT',
    );
    const apiKey = this.configService.get<string>('AZURE_FORM_RECOGNIZER_KEY');

    if (!endpoint || !apiKey) {
      console.warn(
        'Azure Form Recognizer not configured. Falling back to mock.',
      );
      return this.processMock(file, organizationId);
    }

    // TODO: Implement Azure Form Recognizer integration
    // const { FormRecognizerClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
    // const client = new FormRecognizerClient(endpoint, new AzureKeyCredential(apiKey));
    // ... process document

    console.warn(
      'Azure Form Recognizer integration not yet implemented. Using mock.',
    );
    return this.processMock(file, organizationId);
  }
}
