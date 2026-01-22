import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CategoryDetectionService } from './category-detection.service';

const execAsync = promisify(exec);

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
    const startTime = Date.now();
    const provider = this.configService.get<string>('OCR_PROVIDER', 'mock');

    console.log('='.repeat(80));
    console.log('[OCR] ========== STARTING OCR PROCESS ==========');
    console.log(`[OCR] File: ${file.originalname}`);
    console.log(`[OCR] Size: ${(file.size / 1024).toFixed(2)} KB`);
    console.log(`[OCR] MIME Type: ${file.mimetype}`);
    console.log(`[OCR] Provider: ${provider}`);
    console.log(`[OCR] Organization ID: ${organizationId || 'N/A'}`);
    console.log('='.repeat(80));

    // Check if file is PDF
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    console.log(`[OCR] File type detection: ${isPdf ? 'PDF' : 'Image'}`);

    let result: OcrResult;
    try {
    switch (provider.toLowerCase()) {
      case 'google':
          console.log('[OCR] Using Google Vision provider');
        if (isPdf) {
            result = await this.processPdfWithGoogleVision(
              file,
              organizationId,
            );
          } else {
            result = await this.processWithGoogleVision(file, organizationId);
          }
          break;
      case 'azure':
          console.log('[OCR] Using Azure Form Recognizer provider');
          result = await this.processWithAzureFormRecognizer(
            file,
            organizationId,
          );
          break;
      default:
          console.log('[OCR] Using mock provider');
          result = await this.processMock(file, organizationId);
      }

      const duration = Date.now() - startTime;
      console.log('='.repeat(80));
      console.log('[OCR] ========== OCR PROCESS COMPLETED ==========');
      console.log(`[OCR] Duration: ${duration}ms`);
      console.log(`[OCR] Vendor: ${result.vendorName || 'N/A'}`);
      console.log(`[OCR] Invoice Number: ${result.invoiceNumber || 'N/A'}`);
      console.log(`[OCR] Amount: ${result.amount || 0}`);
      console.log(`[OCR] VAT Amount: ${result.vatAmount || 0}`);
      console.log(`[OCR] Date: ${result.expenseDate || 'N/A'}`);
      console.log(`[OCR] Confidence: ${result.confidence}`);
      console.log(
        `[OCR] Provider Used: ${result.fields?.provider || 'unknown'}`,
      );
      console.log('='.repeat(80));

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('='.repeat(80));
      console.error('[OCR] ========== OCR PROCESS FAILED ==========');
      console.error(`[OCR] Duration: ${duration}ms`);
      console.error(`[OCR] Error: ${error.message}`);
      console.error(`[OCR] Stack: ${error.stack}`);
      console.error('='.repeat(80));
      throw error;
    }
  }

  /**
   * Get or create OCR debug directory for saving images
   */
  private getOcrDebugDir(): string {
    const debugDir = path.join(process.cwd(), 'ocr-debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
      console.log(`[OCR] Created debug directory: ${debugDir}`);
    }
    return debugDir;
  }

  /**
   * Save image buffer to disk for debugging
   */
  private async saveDebugImage(
    imageBuffer: Buffer,
    filename: string,
    metadata?: Record<string, any>,
  ): Promise<string> {
    try {
      const debugDir = this.getOcrDebugDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filepath = path.join(debugDir, `${timestamp}_${safeFilename}`);

      await fs.promises.writeFile(filepath, imageBuffer);
      console.log(
        `[OCR] Saved debug image: ${filepath} (${(imageBuffer.length / 1024).toFixed(2)} KB)`,
      );

      // Save metadata if provided
      if (metadata) {
        const metadataPath = filepath + '.json';
        await fs.promises.writeFile(
          metadataPath,
          JSON.stringify(metadata, null, 2),
        );
        console.log(`[OCR] Saved debug metadata: ${metadataPath}`);
      }

      return filepath;
    } catch (error: any) {
      console.warn(`[OCR] Failed to save debug image: ${error.message}`);
      return '';
    }
  }

  private async processMock(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    console.log('[OCR] [MOCK] Starting mock provider processing');
    // Mock implementation for development/testing
    // In production, replace with actual OCR service
    const now = new Date();

    // Check if file is PDF and try to extract text
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    console.log(`[OCR] [MOCK] File is PDF: ${isPdf}`);

    // For PDFs, try to extract text using pdf-parse (even in mock mode)
    if (isPdf) {
      try {
        console.log(
          '[OCR] [MOCK] Attempting to extract text from PDF using pdf-parse...',
        );
        const pdfText = await this.extractTextFromPdf(file.buffer);
        console.log(
          `[OCR] [MOCK] Extracted text length: ${pdfText?.length || 0} characters`,
        );

        if (pdfText && pdfText.trim().length > 50) {
          // Check if the extracted text is meaningful (not just page markers)
          const trimmedText = pdfText.trim();
          const isOnlyPageMarkers = this.isOnlyPageMarkers(trimmedText);

          console.log(
            `[OCR] [MOCK] Text is only page markers: ${isOnlyPageMarkers}`,
          );
          console.log(
            `[OCR] [MOCK] First 200 chars: ${pdfText.substring(0, 200)}`,
          );

          if (!isOnlyPageMarkers) {
            console.log(
              '[OCR] [MOCK] ✓ Successfully extracted meaningful text from PDF using pdf-parse',
            );
            // Parse the extracted text
            console.log('[OCR] [MOCK] Parsing extracted text...');
            const parsed = this.parseOcrText(pdfText);
            console.log(
              `[OCR] [MOCK] Parsed vendor: ${parsed.vendorName || 'N/A'}`,
            );
            console.log(
              `[OCR] [MOCK] Parsed invoice: ${parsed.invoiceNumber || 'N/A'}`,
            );
            console.log(`[OCR] [MOCK] Parsed amount: ${parsed.amount || 0}`);
            console.log(
              `[OCR] [MOCK] Parsed date: ${parsed.expenseDate || 'N/A'}`,
            );

            // Detect category if organizationId is provided
            let suggestedCategoryId: string | undefined;
            if (organizationId) {
              const detectedCategory =
                await this.categoryDetectionService.detectCategoryWithAI(
                  pdfText,
                  parsed.vendorName,
                  organizationId,
                );
              if (detectedCategory) {
                suggestedCategoryId = detectedCategory.id;
              }
            }

            // Create description from full text
            const description = this.buildDescription(pdfText, parsed);

            return {
              vendorName: parsed.vendorName || 'Unknown Vendor',
              vendorTrn: parsed.vendorTrn,
              invoiceNumber: parsed.invoiceNumber || `INV-${now.getTime()}`,
              amount: parsed.amount || 0,
              vatAmount: parsed.vatAmount,
              expenseDate:
                parsed.expenseDate || now.toISOString().substring(0, 10),
              description: description || `Uploaded file: ${file.originalname}`,
              suggestedCategoryId,
              confidence: 0.75, // Higher confidence when text is extracted
              fields: {
                fullText: pdfText.substring(0, 500),
                originalFileName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                provider: 'mock-pdf-parse',
                extractionMethod: 'pdf-parse',
                note: 'Using pdf-parse for text extraction. Configure GOOGLE_VISION_API_KEY or AZURE_FORM_RECOGNIZER_KEY for better OCR results.',
              },
            };
          }
        }
      } catch (pdfError: any) {
        console.warn(
          '[OCR] [MOCK] ✗ Failed to extract text from PDF:',
          pdfError.message,
        );
        console.warn(`[OCR] [MOCK] Error stack: ${pdfError.stack}`);
        // Fall through to filename-based extraction
      }
    }

    // Fallback: Try to extract basic info from filename
    console.log('[OCR] [MOCK] Falling back to filename-based extraction');
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

      console.log(
        `[OCR] [GOOGLE-VISION] Checking credentials: BASE64=${!!credentialsBase64}, JSON=${!!credentialsJson}, PATH=${!!credentialsPath}`,
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

      // Validate image buffer before sending to Google Vision
      if (!file.buffer || file.buffer.length === 0) {
        throw new Error('Image buffer is empty');
      }

      // Log image info for debugging
      const imageSizeKB = (file.buffer.length / 1024).toFixed(2);
      console.log(
        `[OCR] Processing image with Google Vision: ${file.originalname}, ${imageSizeKB} KB, type: ${file.mimetype}`,
      );

      // Perform text detection on the image or PDF
      // Note: Google Vision API textDetection supports both images and PDFs
      // For PDFs, it processes the first page or converts PDF to images
      const [result] = await client.textDetection({
        image: { content: file.buffer },
      });

      const detections = result.textAnnotations;
      if (!detections || detections.length === 0) {
        const fileType = file.mimetype === 'application/pdf' ? 'PDF' : 'image';
        console.warn(
          `[OCR] No text detected in ${fileType} (${imageSizeKB} KB). This could indicate:\n` +
            '  1. The image quality is too low\n' +
            '  2. The image is corrupted\n' +
            '  3. The document is blank or unreadable\n' +
            '  4. Google Vision API configuration issue\n' +
            'Falling back to mock provider.',
        );
        return this.processMock(file, organizationId);
      }

      console.log(
        `[OCR] Google Vision detected ${detections.length} text annotation(s)`,
      );

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
   * Note: Google Vision API's textDetection does NOT support PDFs directly.
   * We first try to extract text using pdf-parse, then use Google Vision API
   * on the first page converted to image if available, or fall back to text extraction.
   */
  private async processPdfWithGoogleVision(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    console.log('[OCR] Processing PDF file with Google Vision provider');

    // Check if Google credentials are configured
    const credentialsBase64 = this.configService.get<string>(
      'GOOGLE_CREDENTIALS_BASE64',
    );
    const credentialsJson = this.configService.get<string>(
      'GOOGLE_CREDENTIALS_JSON',
    );
    const credentialsPath = this.configService.get<string>(
      'GOOGLE_APPLICATION_CREDENTIALS',
    );
    const defaultCredsPath = path.join(
      process.cwd(),
      'google-credentials.json',
    );

    const hasCredentials =
      credentialsBase64 ||
      credentialsJson ||
      (credentialsPath && fs.existsSync(credentialsPath)) ||
      fs.existsSync(defaultCredsPath);

    if (!hasCredentials) {
      console.warn(
        '[OCR] Google Vision credentials not configured. Falling back to improved mock provider with pdf-parse.',
      );
      return this.processMock(file, organizationId);
    }

    // First, try to extract text directly from PDF using pdf-parse
    let pdfText = '';
    let isScannedPdf = false;

    try {
      pdfText = await this.extractTextFromPdf(file.buffer);
      if (pdfText && pdfText.trim().length > 0) {
        // Check if the extracted text is meaningful (not just page markers or minimal text)
        const trimmedText = pdfText.trim();
        const isOnlyPageMarkers = this.isOnlyPageMarkers(trimmedText);
        const hasMinimalText = trimmedText.length < 50; // Less than 50 characters is likely not useful

        if (isOnlyPageMarkers || hasMinimalText) {
          console.log(
            '[OCR] PDF appears to be scanned (only page markers or minimal text extracted)',
          );
          isScannedPdf = true;
        } else {
          console.log(
            '[OCR] Successfully extracted meaningful text from PDF using pdf-parse',
          );
          // Parse the extracted text
          const parsed = this.parseOcrText(pdfText);

          // Detect category if organizationId is provided
          let suggestedCategoryId: string | undefined;
          if (organizationId) {
            const detectedCategory =
              await this.categoryDetectionService.detectCategoryWithAI(
                pdfText,
                parsed.vendorName,
                organizationId,
              );
            if (detectedCategory) {
              suggestedCategoryId = detectedCategory.id;
            }
          }

          // Create description from full text
          const description = this.buildDescription(pdfText, parsed);

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
            confidence: 0.75, // Lower confidence for PDF text extraction
            fields: {
              fullText: pdfText.substring(0, 500),
              originalFileName: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              provider: 'pdf-parse',
              extractionMethod: 'pdf-parse',
            },
          };
        }
      } else {
        isScannedPdf = true;
      }
    } catch (pdfError: any) {
      console.warn(
        '[OCR] Failed to extract text from PDF using pdf-parse:',
        pdfError.message,
      );
      isScannedPdf = true;
    }

    // If PDF is scanned (image-based), convert pages to images and process with Google Vision API
    if (isScannedPdf) {
      console.log('[OCR] Converting PDF pages to images for OCR processing');
      try {
        return await this.processScannedPdf(file, organizationId);
      } catch (error: any) {
        console.warn('[OCR] Failed to process scanned PDF:', error.message);
        // Fallback to mock
        console.log('[OCR] Falling back to mock OCR for PDF');
        return this.processMock(file, organizationId);
      }
    }

    // Final fallback to mock
    console.log('[OCR] Falling back to mock OCR for PDF');
    return this.processMock(file, organizationId);
  }

  /**
   * Check if extracted text is only page markers (e.g., "-- 1 of 3 --")
   */
  private isOnlyPageMarkers(text: string): boolean {
    // Remove common page marker patterns
    const pageMarkerPatterns = [
      /--\s*\d+\s+of\s+\d+\s+--/gi,
      /Page\s+\d+\s+of\s+\d+/gi,
      /^\s*[\d\s\-]+\s*$/gm, // Lines with only numbers, spaces, and dashes
    ];

    let cleanedText = text;
    for (const pattern of pageMarkerPatterns) {
      cleanedText = cleanedText.replace(pattern, '');
    }

    // If after removing page markers, there's very little text left, it's likely only page markers
    const remainingText = cleanedText.trim();
    return remainingText.length < 20; // Less than 20 characters after removing markers
  }

  /**
   * Process scanned PDF by converting pages to images and using Google Vision API
   * Prioritizes invoice/tax invoice pages over delivery notes and purchase orders
   */
  private async processScannedPdf(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    console.log('[OCR] [SCANNED-PDF] Processing scanned PDF');
    console.log(
      `[OCR] [SCANNED-PDF] File: ${file.originalname}, Size: ${(file.buffer.length / 1024).toFixed(2)} KB`,
    );

    // Convert PDF pages to images
    console.log('[OCR] [SCANNED-PDF] Converting PDF pages to images...');
    const pageImages = await this.convertPdfPagesToImages(
      file.buffer,
      file.originalname,
    );

    if (pageImages.length === 0) {
      console.error(
        '[OCR] [SCANNED-PDF] ✗ Failed to convert PDF pages to images',
      );
      throw new Error('Failed to convert PDF pages to images');
    }

    console.log(
      `[OCR] [SCANNED-PDF] ✓ Converted ${pageImages.length} PDF page(s) to images`,
    );

    // Step 1: Identify which page is the invoice/tax invoice
    const invoicePageIndex = await this.identifyInvoicePage(
      pageImages,
      file.originalname,
    );

    if (invoicePageIndex === -1) {
      console.warn(
        '[OCR] Could not identify invoice page, processing all pages',
      );
    } else {
      console.log(
        `[OCR] Identified page ${invoicePageIndex + 1} as invoice/tax invoice`,
      );
    }

    // Step 2: Process pages in priority order (invoice first, then others if needed)
    let primaryText = '';
    let primaryResult: OcrResult | null = null;
    const allDetections: any[] = [];
    let totalConfidence = 0;
    const processedPages = new Set<number>();

    // First, process the invoice page if identified
    if (invoicePageIndex !== -1) {
      const imageBuffer = pageImages[invoicePageIndex];
      console.log(
        `[OCR] Processing invoice page ${invoicePageIndex + 1} (priority)`,
      );

      try {
        const imageFile: Express.Multer.File = {
          fieldname: 'file',
          originalname: `${file.originalname}_page_${invoicePageIndex + 1}.png`,
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: imageBuffer,
          size: imageBuffer.length,
          destination: '',
          filename: '',
          path: '',
          stream: null as any,
        };

        // Validate image before processing
        if (imageBuffer.length < 1000) {
          console.warn(
            `[OCR] Page ${invoicePageIndex + 1} image is too small (${imageBuffer.length} bytes). Skipping.`,
          );
          // Skip this page - don't process it
        } else {
        primaryResult = await this.processWithGoogleVision(
          imageFile,
          organizationId,
        );
        primaryText = primaryResult.fields?.fullText || '';
        totalConfidence = primaryResult.confidence || 0;
        processedPages.add(invoicePageIndex);

          // Check if we got meaningful text (not just from mock fallback)
          const hasText = primaryText && primaryText.trim().length > 50;
          const isMockResult =
            primaryResult.fields?.provider === 'mock' ||
            primaryResult.fields?.provider === 'mock-pdf-parse';

          if (!hasText && isMockResult) {
            console.warn(
              `[OCR] Google Vision failed and mock provider also couldn't extract text from page ${invoicePageIndex + 1}. ` +
                `Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`,
            );
          } else if (hasText) {
            console.log(
              `[OCR] Successfully extracted ${primaryText.length} characters from page ${invoicePageIndex + 1}`,
            );
          }

        allDetections.push({
          page: invoicePageIndex + 1,
          confidence: primaryResult.confidence,
          pageType: 'invoice',
          isPrimary: true,
            hasText: hasText,
            provider: primaryResult.fields?.provider,
        });

          if (hasText) {
        console.log(
          `[OCR] Successfully processed invoice page with ${primaryText.length} characters`,
        );
          }
        }
      } catch (pageError: any) {
        console.warn(
          `[OCR] Failed to process invoice page:`,
          pageError.message,
        );
      }
    }

    // Step 3: If invoice page didn't yield good results, process other pages as fallback
    // But only if we didn't get meaningful data from invoice page
    const hasGoodInvoiceData = primaryText && primaryText.trim().length > 100;

    if (!hasGoodInvoiceData && invoicePageIndex === -1) {
      // No invoice page identified, process all pages
      console.log('[OCR] Processing all pages (no invoice page identified)');
      for (let i = 0; i < pageImages.length; i++) {
        if (processedPages.has(i)) continue;

        const imageBuffer = pageImages[i];
        console.log(`[OCR] Processing page ${i + 1} of ${pageImages.length}`);

        try {
          const imageFile: Express.Multer.File = {
            fieldname: 'file',
            originalname: `${file.originalname}_page_${i + 1}.png`,
            encoding: '7bit',
            mimetype: 'image/png',
            buffer: imageBuffer,
            size: imageBuffer.length,
            destination: '',
            filename: '',
            path: '',
            stream: null as any,
          };

          const pageResult = await this.processWithGoogleVision(
            imageFile,
            organizationId,
          );

          if (pageResult.fields?.fullText) {
            if (!primaryText) {
              primaryText = pageResult.fields.fullText;
              primaryResult = pageResult;
            } else {
              primaryText += '\n\n' + pageResult.fields.fullText;
            }
          }

          totalConfidence += pageResult.confidence || 0;
          processedPages.add(i);

          allDetections.push({
            page: i + 1,
            confidence: pageResult.confidence,
            pageType: 'unknown',
            isPrimary: false,
          });
        } catch (pageError: any) {
          console.warn(
            `[OCR] Failed to process page ${i + 1}:`,
            pageError.message,
          );
        }
      }
    }

    if (!primaryText || primaryText.trim().length === 0) {
      // Check what providers were actually used
      const providersUsed = allDetections.map((d) => d.provider).filter(Boolean);
      const hasGoogleAttempt = allDetections.some((d) => d.provider === 'google');
      const hasMockFallback = allDetections.some(
        (d) => d.provider === 'mock' || d.provider === 'mock-pdf-parse',
      );

      console.error(`[OCR] ========== DIAGNOSTIC INFO ==========`);
      console.error(`[OCR] Providers attempted: ${providersUsed.join(', ') || 'none'}`);
      console.error(`[OCR] Google Vision attempted: ${hasGoogleAttempt}`);
      console.error(`[OCR] Mock fallback used: ${hasMockFallback}`);
      console.error(`[OCR] Pages processed: ${processedPages.size}`);
      console.error(`[OCR] All detections:`, JSON.stringify(allDetections, null, 2));

      // Check Google credentials configuration
      const hasCredentialsBase64 = !!this.configService.get<string>(
        'GOOGLE_CREDENTIALS_BASE64',
      );
      const hasCredentialsJson = !!this.configService.get<string>(
        'GOOGLE_CREDENTIALS_JSON',
      );
      const hasCredentialsPath = !!this.configService.get<string>(
        'GOOGLE_APPLICATION_CREDENTIALS',
      );
      console.error(
        `[OCR] Google credentials configured: BASE64=${!!hasCredentialsBase64}, JSON=${!!hasCredentialsJson}, PATH=${!!hasCredentialsPath}`,
      );

      const errorMessage = hasGoogleAttempt
        ? 'No text extracted from PDF pages. Google Vision API was called but returned no text. This could indicate: 1) Invalid credentials, 2) API quota exceeded, 3) Image quality too low, or 4) Blank/corrupted images.'
        : 'No text extracted from PDF pages. Google Vision API was not called. Please configure GOOGLE_CREDENTIALS_BASE64, GOOGLE_CREDENTIALS_JSON, or GOOGLE_APPLICATION_CREDENTIALS environment variable.';
      console.error(`[OCR] ${errorMessage}`);
      console.error(`[OCR] ========================================`);
      throw new Error(errorMessage);
    }

    // Parse the text (prioritizing invoice page if available)
    console.log(`[OCR] Parsing OCR text (length: ${primaryText.length} chars)`);
    console.log(
      `[OCR] First 200 chars of OCR text: ${primaryText.substring(0, 200)}`,
    );
    const parsed = this.parseOcrText(primaryText);
    console.log(`[OCR] Parsed results:`, {
      vendorName: parsed.vendorName,
      vendorTrn: parsed.vendorTrn,
      invoiceNumber: parsed.invoiceNumber,
      amount: parsed.amount,
    });

    // Detect category if organizationId is provided
    let suggestedCategoryId: string | undefined;
    if (organizationId) {
      const detectedCategory =
        await this.categoryDetectionService.detectCategoryWithAI(
          primaryText,
          parsed.vendorName,
          organizationId,
        );
      if (detectedCategory) {
        suggestedCategoryId = detectedCategory.id;
      }
    }

    // Create description from primary text
    const description = this.buildDescription(primaryText, parsed);

    const avgConfidence =
      allDetections.length > 0
        ? totalConfidence / allDetections.length
        : primaryResult?.confidence || 0.75;

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
      confidence: avgConfidence,
      fields: {
        fullText: primaryText.substring(0, 1000), // Limit to 1000 chars
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        provider: 'google-vision',
        extractionMethod: 'pdf-to-image-then-ocr',
        pagesProcessed: processedPages.size,
        invoicePageIndex: invoicePageIndex !== -1 ? invoicePageIndex + 1 : null,
        pageDetections: allDetections,
      },
    };
  }

  /**
   * Identify which page is the invoice/tax invoice by scanning page content
   * Returns the 0-based index of the invoice page, or -1 if not found
   */
  private async identifyInvoicePage(
    pageImages: Buffer[],
    originalFileName: string,
  ): Promise<number> {
    // Keywords that indicate an invoice page
    const invoiceKeywords = [
      'tax invoice',
      'invoice',
      'tax inv',
      'bill',
      'billing',
      'amount due',
      'total amount',
      'vat amount',
      'tax amount',
      'invoice number',
      'invoice no',
      'inv no',
      'inv#',
    ];

    // Keywords that indicate non-invoice pages (to exclude)
    const nonInvoiceKeywords = [
      'delivery note',
      'delivery',
      'purchase order',
      'p.o.',
      'po number',
      'purchase order number',
      'goods received',
      'grn',
    ];

    const pageScores: Array<{ index: number; score: number; text: string }> =
      [];

    // Quick scan of each page to identify invoice
    for (let i = 0; i < pageImages.length; i++) {
      const imageBuffer = pageImages[i];

      try {
        // Create a mock file object for quick OCR
        const imageFile: Express.Multer.File = {
          fieldname: 'file',
          originalname: `${originalFileName}_page_${i + 1}.png`,
          encoding: '7bit',
          mimetype: 'image/png',
          buffer: imageBuffer,
          size: imageBuffer.length,
          destination: '',
          filename: '',
          path: '',
          stream: null as any,
        };

        // Do a quick OCR to get text (we'll use the full OCR method)
        // Pass undefined for organizationId for quick scan (category detection not needed)
        const result = await this.processWithGoogleVision(imageFile, undefined);
        const pageText = (result.fields?.fullText || '').toLowerCase();

        if (pageText.length === 0) {
          continue; // Skip pages with no text
        }

        // Calculate score: positive for invoice keywords, negative for non-invoice keywords
        let score = 0;

        // Check for invoice keywords
        for (const keyword of invoiceKeywords) {
          const matches = (pageText.match(new RegExp(keyword, 'gi')) || [])
            .length;
          score += matches * 10; // Higher weight for invoice keywords
        }

        // Check for non-invoice keywords (reduce score)
        for (const keyword of nonInvoiceKeywords) {
          const matches = (pageText.match(new RegExp(keyword, 'gi')) || [])
            .length;
          score -= matches * 15; // Higher penalty for non-invoice keywords
        }

        // Bonus for first page (often the invoice)
        if (i === 0) {
          score += 5;
        }

        pageScores.push({
          index: i,
          score: score,
          text: pageText.substring(0, 200), // Store first 200 chars for debugging
        });

        console.log(
          `[OCR] Page ${i + 1} score: ${score} (${pageText.substring(0, 50)}...)`,
        );
      } catch (error: any) {
        console.warn(
          `[OCR] Failed to scan page ${i + 1} for identification:`,
          error.message,
        );
        continue;
      }
    }

    // Find page with highest score
    if (pageScores.length === 0) {
      return -1;
    }

    // Sort by score (descending)
    pageScores.sort((a, b) => b.score - a.score);

    // Return the page with highest score, but only if score is positive
    // (negative scores indicate non-invoice pages)
    const bestPage = pageScores[0];
    if (bestPage.score > 0) {
      console.log(
        `[OCR] Identified page ${bestPage.index + 1} as invoice (score: ${bestPage.score})`,
      );
      return bestPage.index;
    }

    // If no page has positive score, return first page as fallback
    console.log(
      '[OCR] No clear invoice page identified, using first page as fallback',
    );
    return 0;
  }

  /**
   * Convert PDF pages to image buffers
   * Uses Poppler's pdftoppm for reliable PDF to image conversion
   * Falls back to pdfjs-dist if pdftoppm is not available
   */
  private async convertPdfPagesToImages(
    pdfBuffer: Buffer,
    originalFileName?: string,
  ): Promise<Buffer[]> {
    console.log('[OCR] [PDF-TO-IMAGE] Starting PDF to image conversion');
    console.log(
      `[OCR] [PDF-TO-IMAGE] PDF buffer size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`,
    );

    // Try Poppler's pdftoppm first (most reliable - uses Poppler library)
    // Note: pdftoppm requires poppler-utils to be installed on the system
    try {
      console.log(
        '[OCR] [PDF-TO-IMAGE] Attempting conversion with Poppler (pdftoppm)...',
      );
      console.log(
        '[OCR] [PDF-TO-IMAGE] Note: Requires poppler-utils to be installed',
      );

      // pdftoppm requires a file path, so we need to save the buffer temporarily
      const debugDir = this.getOcrDebugDir();
      const tempPdfPath = path.join(
        debugDir,
        `temp_${Date.now()}_${originalFileName || 'document.pdf'}`,
      );

      // Save PDF buffer to temporary file
      await fs.promises.writeFile(tempPdfPath, pdfBuffer);
      console.log(
        `[OCR] [PDF-TO-IMAGE] Saved PDF to temporary file: ${tempPdfPath}`,
      );

      try {
        // Use pdftoppm with high quality settings for OCR
        // pdftoppm creates files like: output-01.png, output-02.png, etc.
        const outputPrefix = path.join(debugDir, `page_${Date.now()}`);
        
        console.log(
          '[OCR] [PDF-TO-IMAGE] Converting PDF pages with pdftoppm...',
        );
        console.log(
          `[OCR] [PDF-TO-IMAGE] Command: pdftoppm -r 300 -png -aa yes -aaVector yes "${tempPdfPath}" "${outputPrefix}"`,
        );

        // Execute pdftoppm command
        // -r 300: 300 DPI resolution for high quality OCR
        // -png: Output PNG format
        // -aa yes: Enable anti-aliasing
        // -aaVector yes: Enable vector anti-aliasing
        // Output will be: outputPrefix-01.png, outputPrefix-02.png, etc.
        let stdout = '';
        let stderr = '';
        let commandSucceeded = false;
        try {
          const result = await execAsync(
            `pdftoppm -r 300 -png -aa yes -aaVector yes "${tempPdfPath}" "${outputPrefix}"`,
          );
          stdout = result.stdout || '';
          stderr = result.stderr || '';
          commandSucceeded = true;
        } catch (execError: any) {
          // execAsync throws on non-zero exit code, but pdftoppm might still create files
          stdout = execError.stdout || '';
          stderr = execError.stderr || '';
          console.warn(
            `[OCR] [PDF-TO-IMAGE] pdftoppm command failed: ${execError.message}`,
          );
          if (stderr) {
            console.warn(
              `[OCR] [PDF-TO-IMAGE] pdftoppm stderr: ${stderr}`,
            );
          }
        }

        if (stderr && !stderr.includes('Writing')) {
          console.warn(
            `[OCR] [PDF-TO-IMAGE] pdftoppm stderr: ${stderr}`,
          );
        }

        console.log(
          `[OCR] [PDF-IMAGE] pdftoppm stdout: ${stdout || '(no output)'}`,
        );

        // Wait a moment for files to be written to disk
        await new Promise((resolve) => setTimeout(resolve, 200));

        // List directory to see what files were actually created
        const outputBaseName = path.basename(outputPrefix);
        let matchingFiles: string[] = [];
        try {
          const dirFiles = await fs.promises.readdir(debugDir);
          matchingFiles = dirFiles
            .filter((f) => f.startsWith(outputBaseName) && f.endsWith('.png'))
            .sort((a, b) => {
              // Natural sort: extract page numbers and compare
              const numA = parseInt(a.match(/-(\d+)\.png$/)?.[1] || '0');
              const numB = parseInt(b.match(/-(\d+)\.png$/)?.[1] || '0');
              return numA - numB;
            });
          console.log(
            `[OCR] [PDF-TO-IMAGE] Files in directory matching prefix "${outputBaseName}": ${matchingFiles.length > 0 ? matchingFiles.join(', ') : '(none)'}`,
          );
          
          // If we found files but they don't match our expected pattern, try to use them
          if (matchingFiles.length > 0 && !commandSucceeded) {
            console.log(
              `[OCR] [PDF-TO-IMAGE] Found ${matchingFiles.length} file(s) despite command error, attempting to use them`,
            );
          }
        } catch (dirError: any) {
          console.warn(
            `[OCR] [PDF-TO-IMAGE] Could not list directory: ${dirError.message}`,
          );
        }

        // pdftoppm creates files with pattern: prefix-01.png, prefix-02.png, or prefix-1.png, prefix-2.png
        // Find all generated image files
        const imageBuffers: Buffer[] = [];
        const tempImageFiles: string[] = [];
        const maxPages = 5; // Limit to first 5 pages for performance

        // If we found files from directory listing, use those directly
        if (matchingFiles.length > 0) {
          console.log(
            `[OCR] [PDF-TO-IMAGE] Using ${matchingFiles.length} file(s) found in directory listing`,
          );
          for (let i = 0; i < Math.min(matchingFiles.length, maxPages); i++) {
            const fileName = matchingFiles[i];
            const imagePath = path.join(debugDir, fileName);
            const pageNum = i + 1;

            try {
              console.log(
                `[OCR] [PDF-TO-IMAGE] Reading page ${pageNum} from: ${imagePath}`,
              );

              const imageBuffer = await fs.promises.readFile(imagePath);
              tempImageFiles.push(imagePath);

              console.log(
                `[OCR] [PDF-TO-IMAGE] ✓ Page ${pageNum} converted: ${(imageBuffer.length / 1024).toFixed(2)} KB`,
              );

              // Verify image is not blank by checking PNG header
              let hasContent = true;
              if (imageBuffer.length > 8) {
                // Check PNG header
                const isPng =
                  imageBuffer[0] === 0x89 &&
                  imageBuffer[1] === 0x50 &&
                  imageBuffer[2] === 0x4e &&
                  imageBuffer[3] === 0x47;

                if (isPng) {
                  // Sample pixels for non-white content
                  const sampleStart = Math.min(100, imageBuffer.length);
                  const sampleEnd = Math.min(1100, imageBuffer.length);
                  const sample = imageBuffer.slice(sampleStart, sampleEnd);
                  hasContent = sample.some(
                    (byte: number) => byte !== 0xff && byte !== 0x00,
                  );
                } else {
                  console.warn(
                    `[OCR] [PDF-TO-IMAGE] ⚠️ Warning: Page ${pageNum} may not be a valid PNG`,
                  );
                }
              }

              if (!hasContent) {
                console.warn(
                  `[OCR] [PDF-TO-IMAGE] ⚠️ Warning: Page ${pageNum} may be blank`,
                );
              } else {
                console.log(
                  `[OCR] [PDF-TO-IMAGE] ✓ Page ${pageNum} has content`,
                );
              }

              // Copy to final debug location with better naming
              const imageFilename = originalFileName
                ? `${originalFileName.replace(/\.pdf$/i, '')}_page_${pageNum}.png`
                : `page_${pageNum}.png`;

              const finalDebugPath = await this.saveDebugImage(
                imageBuffer,
                imageFilename,
                {
                  pageNumber: pageNum,
                  sizeKB: imageBuffer.length / 1024,
                  method: 'pdftoppm',
                  hasContent: hasContent,
                  originalFileName: originalFileName,
                  tempPath: imagePath,
                },
              );

              if (finalDebugPath) {
                console.log(
                  `[OCR] [PDF-TO-IMAGE] ✓ Saved debug image: ${finalDebugPath}`,
                );
              }

              imageBuffers.push(imageBuffer);
            } catch (readError: any) {
              console.warn(
                `[OCR] [PDF-TO-IMAGE] Failed to read page ${pageNum}: ${readError.message}`,
              );
              // Continue to next page
            }
          }
        } else {
          // Fallback: try to find files by pattern (for backwards compatibility)
          for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          // pdftoppm may use either zero-padded (01, 02) or single-digit (1, 2) page numbers
          // Try both patterns
          const pageNumberZeroPadded = pageNum.toString().padStart(2, '0');
          const pageNumberSingle = pageNum.toString();
          const imagePathZeroPadded = `${outputPrefix}-${pageNumberZeroPadded}.png`;
          const imagePathSingle = `${outputPrefix}-${pageNumberSingle}.png`;

          // Check which pattern exists
          let imagePath: string | null = null;
          if (fs.existsSync(imagePathZeroPadded)) {
            imagePath = imagePathZeroPadded;
            console.log(
              `[OCR] [PDF-TO-IMAGE] Found page ${pageNum} with zero-padded pattern: ${imagePath}`,
            );
          } else if (fs.existsSync(imagePathSingle)) {
            imagePath = imagePathSingle;
            console.log(
              `[OCR] [PDF-TO-IMAGE] Found page ${pageNum} with single-digit pattern: ${imagePath}`,
            );
          } else {
            console.log(
              `[OCR] [PDF-TO-IMAGE] Checking for page ${pageNum} at: ${imagePathZeroPadded} or ${imagePathSingle}`,
            );
          }

          if (imagePath) {
            try {
              console.log(
                `[OCR] [PDF-TO-IMAGE] Reading page ${pageNum} from: ${imagePath}`,
              );

              const imageBuffer = await fs.promises.readFile(imagePath);
              tempImageFiles.push(imagePath);

              console.log(
                `[OCR] [PDF-TO-IMAGE] ✓ Page ${pageNum} converted: ${(imageBuffer.length / 1024).toFixed(2)} KB`,
              );

              // Verify image is not blank by checking PNG header
              let hasContent = true;
              if (imageBuffer.length > 8) {
                // Check PNG header
                const isPng =
                  imageBuffer[0] === 0x89 &&
                  imageBuffer[1] === 0x50 &&
                  imageBuffer[2] === 0x4e &&
                  imageBuffer[3] === 0x47;

                if (isPng) {
                  // Sample pixels for non-white content
                  const sampleStart = Math.min(100, imageBuffer.length);
                  const sampleEnd = Math.min(1100, imageBuffer.length);
                  const sample = imageBuffer.slice(sampleStart, sampleEnd);
                  hasContent = sample.some(
                    (byte: number) => byte !== 0xff && byte !== 0x00,
                  );
                } else {
                  console.warn(
                    `[OCR] [PDF-TO-IMAGE] ⚠️ Warning: Page ${pageNum} may not be a valid PNG`,
                  );
                }
              }

              if (!hasContent) {
                console.warn(
                  `[OCR] [PDF-TO-IMAGE] ⚠️ Warning: Page ${pageNum} may be blank`,
                );
              } else {
                console.log(
                  `[OCR] [PDF-TO-IMAGE] ✓ Page ${pageNum} has content`,
                );
              }

              // Copy to final debug location with better naming
              const imageFilename = originalFileName
                ? `${originalFileName.replace(/\.pdf$/i, '')}_page_${pageNum}.png`
                : `page_${pageNum}.png`;

              const finalDebugPath = await this.saveDebugImage(
                imageBuffer,
                imageFilename,
                {
                  pageNumber: pageNum,
                  sizeKB: imageBuffer.length / 1024,
                  method: 'pdftoppm',
                  hasContent: hasContent,
                  originalFileName: originalFileName,
                  tempPath: imagePath,
                },
              );

              if (finalDebugPath) {
                console.log(
                  `[OCR] [PDF-TO-IMAGE] ✓ Saved debug image: ${finalDebugPath}`,
                );
              }

              imageBuffers.push(imageBuffer);
            } catch (readError: any) {
              console.warn(
                `[OCR] [PDF-TO-IMAGE] Failed to read page ${pageNum}: ${readError.message}`,
              );
              // Continue to next page
            }
          } else {
            // No more pages found
            if (pageNum === 1 && imageBuffers.length === 0) {
              // First page not found - try simpler command as fallback
              console.log(
                `[OCR] [PDF-TO-IMAGE] No files found with complex flags, trying simpler command...`,
              );
              try {
                const simpleResult = await execAsync(
                  `pdftoppm -png "${tempPdfPath}" "${outputPrefix}"`,
                );
                console.log(
                  `[OCR] [PDF-TO-IMAGE] Simple command stdout: ${simpleResult.stdout || '(no output)'}`,
                );
                if (simpleResult.stderr) {
                  console.log(
                    `[OCR] [PDF-TO-IMAGE] Simple command stderr: ${simpleResult.stderr}`,
                  );
                }
                // Wait for files
                await new Promise((resolve) => setTimeout(resolve, 200));
                // Check again for page 1 - try both patterns
                const simpleImagePathZeroPadded = `${outputPrefix}-01.png`;
                const simpleImagePathSingle = `${outputPrefix}-1.png`;
                let simpleImagePath: string | null = null;
                
                if (fs.existsSync(simpleImagePathZeroPadded)) {
                  simpleImagePath = simpleImagePathZeroPadded;
                } else if (fs.existsSync(simpleImagePathSingle)) {
                  simpleImagePath = simpleImagePathSingle;
                }
                
                if (simpleImagePath) {
                  console.log(
                    `[OCR] [PDF-TO-IMAGE] ✓ Simple command worked! Reading page 1 from: ${simpleImagePath}`,
                  );
                  try {
                    const imageBuffer = await fs.promises.readFile(simpleImagePath);
                    tempImageFiles.push(simpleImagePath);
                    console.log(
                      `[OCR] [PDF-TO-IMAGE] ✓ Page 1 converted: ${(imageBuffer.length / 1024).toFixed(2)} KB`,
                    );
                    imageBuffers.push(imageBuffer);
                    // Continue to check for more pages
                    continue;
                  } catch (readError: any) {
                    console.warn(
                      `[OCR] [PDF-TO-IMAGE] Failed to read page 1: ${readError.message}`,
                    );
                  }
                }
              } catch (simpleError: any) {
                console.warn(
                  `[OCR] [PDF-TO-IMAGE] Simple command also failed: ${simpleError.message}`,
                );
              }
            }
            // No more pages found
            console.log(
              `[OCR] [PDF-TO-IMAGE] No more pages found after page ${pageNum - 1}`,
            );
            break;
          }
        }
        } // End of else block for fallback pattern matching

        // Clean up temporary image files created by pdftoppm
        for (const tempFile of tempImageFiles) {
          try {
            await fs.promises.unlink(tempFile);
            console.log(
              `[OCR] [PDF-TO-IMAGE] Cleaned up temp image: ${tempFile}`,
            );
          } catch (cleanupError: any) {
            console.warn(
              `[OCR] [PDF-TO-IMAGE] Failed to cleanup temp image: ${cleanupError.message}`,
            );
          }
        }

        // Clean up temporary PDF file
        try {
          await fs.promises.unlink(tempPdfPath);
          console.log(`[OCR] [PDF-TO-IMAGE] Cleaned up temporary PDF file`);
        } catch (cleanupError: any) {
          console.warn(
            `[OCR] [PDF-TO-IMAGE] Failed to cleanup temp file: ${cleanupError.message}`,
          );
        }

        if (imageBuffers.length > 0) {
          console.log(
            `[OCR] [PDF-TO-IMAGE] ✓ Successfully converted ${imageBuffers.length} page(s) using pdftoppm`,
          );
          return imageBuffers;
        } else {
          throw new Error('No pages were converted by pdftoppm');
        }
      } catch (pdftoppmError: any) {
        const errorMessage = pdftoppmError.message || String(pdftoppmError);
        console.error(
          `[OCR] [PDF-TO-IMAGE] pdftoppm conversion error: ${errorMessage}`,
        );
        // Clean up temp file on error
        try {
          await fs.promises.unlink(tempPdfPath);
        } catch {
          // Ignore cleanup errors
        }
        throw pdftoppmError;
      }
    } catch (pdftoppmError: any) {
      const errorMessage = pdftoppmError.message || String(pdftoppmError);
      console.error(`[OCR] [PDF-TO-IMAGE] pdftoppm failed: ${errorMessage}`);

      // Check for common Poppler errors
      const isPopplerError =
        errorMessage.includes('pdftoppm') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('ENOENT') ||
        errorMessage.includes('spawn') ||
        errorMessage.includes('command not found') ||
        errorMessage.includes('No such file or directory');

      if (isPopplerError) {
        console.error(
          `[OCR] [PDF-TO-IMAGE] ========================================`,
        );
        console.error(`[OCR] [PDF-TO-IMAGE] Missing system dependency!`);
        console.error(
          `[OCR] [PDF-TO-IMAGE] ========================================`,
        );
        console.error(
          `[OCR] [PDF-TO-IMAGE] Required system dependency (NOT npm package):`,
        );
        console.error(
          `[OCR] [PDF-TO-IMAGE]   poppler-utils - for PDF to image conversion`,
        );
        console.error(
          `[OCR] [PDF-TO-IMAGE] ========================================`,
        );
        console.error(`[OCR] [PDF-TO-IMAGE] Installation commands:`);
        console.error(
          `[OCR] [PDF-TO-IMAGE]   macOS: brew install poppler`,
        );
        console.error(
          `[OCR] [PDF-TO-IMAGE]   Ubuntu/Debian: sudo apt-get install poppler-utils`,
        );
        console.error(
          `[OCR] [PDF-TO-IMAGE]   CentOS/RHEL: sudo yum install poppler-utils`,
        );
        console.error(
          `[OCR] [PDF-TO-IMAGE]   Alpine (Docker): apk add poppler-utils`,
        );
        console.error(
          `[OCR] [PDF-TO-IMAGE] ========================================`,
        );
        console.error(
          `[OCR] [PDF-TO-IMAGE] Falling back to pdfjs-dist method (may produce blank images)...`,
        );
      } else {
        console.warn(
          `[OCR] [PDF-TO-IMAGE] pdftoppm error: ${errorMessage}`,
        );
        console.log(
          `[OCR] [PDF-TO-IMAGE] Falling back to pdfjs-dist method...`,
        );
      }
    }

    // Fallback to pdfjs-dist method
    try {
      console.log('[OCR] [PDF-TO-IMAGE] Using fallback: pdfjs-dist method');
      // Dynamically import pdfjs-dist - use legacy build for Node.js
      console.log(
        '[OCR] [PDF-TO-IMAGE] Loading pdfjs-dist/legacy build (recommended for Node.js)...',
      );
      let pdfjsLib: any;
      try {
        // Try legacy build first (recommended for Node.js)
        const pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjsLib = pdfjsModule.default || pdfjsModule;
        console.log('[OCR] [PDF-TO-IMAGE] ✓ Loaded pdfjs-dist legacy build');
      } catch (legacyError: any) {
        console.warn(
          `[OCR] [PDF-TO-IMAGE] Legacy build failed: ${legacyError.message}`,
        );
        try {
          // Fallback to regular build
        const pdfjsModule = await import('pdfjs-dist');
        pdfjsLib = pdfjsModule.default || pdfjsModule;
          console.log(
            '[OCR] [PDF-TO-IMAGE] Using regular pdfjs-dist build (may have issues)',
          );
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        pdfjsLib = require('pdfjs-dist');
          console.log('[OCR] [PDF-TO-IMAGE] Using pdfjs-dist via require');
        }
      }

      // Import canvas for rendering (@napi-rs/canvas is available via pdfjs-dist dependency)
      let createCanvas: any;
      try {
        // Try @napi-rs/canvas first (available as dependency of pdfjs-dist)
        const napiCanvas = await import('@napi-rs/canvas');
        createCanvas =
          napiCanvas.createCanvas || napiCanvas.default?.createCanvas;
      } catch {
        try {
          // Fallback: use require for @napi-rs/canvas
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const canvas = require('@napi-rs/canvas');
          createCanvas = canvas.createCanvas || canvas.default?.createCanvas;
        } catch {
          throw new Error(
            'Canvas library not available for PDF rendering. Please ensure @napi-rs/canvas is installed.',
          );
        }
      }

      if (!createCanvas) {
        throw new Error(
          'Canvas library not available for PDF rendering. Please ensure @napi-rs/canvas is installed.',
        );
      }

      // Import Sharp for image optimization
      let sharp: any;
      try {
        const sharpModule = await import('sharp');
        sharp = sharpModule.default || sharpModule;
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        sharp = require('sharp');
      }

      // Set up pdfjs-dist worker (required for Node.js)
      // Note: pdfjs-dist needs to be configured for Node.js environment
      const pdfjsWorker = pdfjsLib.GlobalWorkerOptions;
      if (pdfjsWorker && !pdfjsWorker.workerSrc) {
        // Set worker source (pdfjs-dist includes worker files)
        try {
          // Try to set worker from pdfjs-dist package
          const pdfjsPath = require.resolve('pdfjs-dist');
          const workerPath = path.join(pdfjsPath, '../build/pdf.worker.mjs');
          pdfjsWorker.workerSrc = workerPath;
        } catch {
          console.warn('[OCR] Could not set pdfjs worker, continuing anyway');
        }
      }

      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        verbosity: 0, // Suppress console warnings
        useSystemFonts: true, // Use system fonts for better compatibility
      });

      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;

      console.log(`[OCR] PDF has ${numPages} page(s)`);

      const imageBuffers: Buffer[] = [];

      // Process each page (limit to first 5 pages for performance)
      const maxPages = Math.min(numPages, 5);
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);

        // Use higher scale (3.0 instead of 2.0) for better OCR quality
        // This increases resolution which helps with text detection
        const scale = 3.0;
        const viewport = page.getViewport({ scale });

        // Create canvas with white background for better contrast
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // Fill with white background (important for scanned documents)
        context.fillStyle = 'white';
        context.fillRect(0, 0, viewport.width, viewport.height);
        console.log(
          `[OCR] [PDF-TO-IMAGE] Canvas created: ${viewport.width}x${viewport.height}, white background filled`,
        );

        // Get page info for debugging
        try {
          const pageInfo = {
            rotate: page.rotate,
            viewBox: page.view,
          };
          console.log(
            `[OCR] [PDF-TO-IMAGE] Page ${pageNum} info:`,
            JSON.stringify(pageInfo),
          );
        } catch (infoError: any) {
          console.warn(
            `[OCR] [PDF-TO-IMAGE] Could not get page info: ${infoError.message}`,
          );
        }

        // Render PDF page to canvas
        // Try with explicit transform matrix to ensure proper rendering
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          // Don't set transform - let pdfjs handle it
        };

        // Render the page and wait for completion
        console.log(
          `[OCR] [PDF-TO-IMAGE] Starting render task for page ${pageNum}...`,
        );
        const renderTask = page.render(renderContext);

        // Add error handling
        let renderError: any = null;
        renderTask.promise.catch((err: any) => {
          renderError = err;
          console.error(
            `[OCR] [PDF-TO-IMAGE] Render task error for page ${pageNum}:`,
            err.message,
          );
        });

        await renderTask.promise;

        if (renderError) {
          throw renderError;
        }

        console.log(
          `[OCR] [PDF-TO-IMAGE] Page ${pageNum} render task completed successfully`,
        );

        // Verify rendering by checking a sample of pixels
        // Check top-left 100x100 area for non-white pixels
        let nonWhitePixels = 0;
        let blankDetectionError: any = null;

        try {
          const sampleWidth = Math.min(100, viewport.width);
          const sampleHeight = Math.min(100, viewport.height);
          console.log(
            `[OCR] [PDF-TO-IMAGE] Checking blank detection for page ${pageNum} (sample: ${sampleWidth}x${sampleHeight})...`,
          );

          const imageData = context.getImageData(
            0,
            0,
            sampleWidth,
            sampleHeight,
          );
          console.log(
            `[OCR] [PDF-TO-IMAGE] Got image data: ${imageData.data.length} bytes`,
          );

          for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            // Check if pixel is not white (allowing for slight variations)
            if (r < 250 || g < 250 || b < 250) {
              nonWhitePixels++;
            }
          }

          console.log(
            `[OCR] [PDF-TO-IMAGE] Page ${pageNum} sample area (${sampleWidth}x${sampleHeight}): ${nonWhitePixels} non-white pixels found`,
          );
        } catch (blankCheckError: any) {
          blankDetectionError = blankCheckError;
          console.error(
            `[OCR] [PDF-TO-IMAGE] Error during blank detection: ${blankCheckError.message}`,
          );
          console.error(`[OCR] [PDF-TO-IMAGE] Stack: ${blankCheckError.stack}`);
        }

        if (blankDetectionError) {
          console.warn(
            `[OCR] [PDF-TO-IMAGE] Could not verify if page ${pageNum} is blank due to error`,
          );
        } else if (nonWhitePixels === 0) {
          console.error(
            `[OCR] [PDF-TO-IMAGE] ⚠️ CRITICAL: Page ${pageNum} is BLANK after rendering!`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE] ========================================`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE] This indicates pdfjs-dist failed to render the PDF content.`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE] Known limitation: pdfjs-dist has issues rendering image-based PDFs in Node.js.`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE] ========================================`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE] WORKAROUND: Since direct image upload works perfectly:`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE]   1. Convert PDF pages to images manually (Preview, Adobe, online tools)`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE]   2. Upload the images directly - they will be processed successfully`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE] ========================================`,
          );
          console.error(
            `[OCR] [PDF-TO-IMAGE] The blank image will be saved to ocr-debug/ for verification.`,
          );
        } else {
          console.log(
            `[OCR] [PDF-TO-IMAGE] ✓ Page ${pageNum} rendering verified - ${nonWhitePixels} non-white pixels detected`,
          );
        }

        // Small delay to ensure rendering is complete (some PDFs need this)
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Convert canvas to PNG buffer
        // Note: @napi-rs/canvas toBuffer() doesn't support options, use default method
        console.log(
          `[OCR] [PDF-TO-IMAGE] Converting page ${pageNum} canvas to PNG buffer...`,
        );
        let imageBuffer: Buffer;
        try {
          imageBuffer = canvas.toBuffer('image/png');
          console.log(
            `[OCR] [PDF-TO-IMAGE] Page ${pageNum} canvas converted: ${(imageBuffer.length / 1024).toFixed(2)} KB`,
          );
        } catch (bufferError: any) {
          console.error(
            `[OCR] [PDF-TO-IMAGE] Failed to convert canvas to PNG for page ${pageNum}: ${bufferError.message}`,
          );
          throw new Error(
            `Failed to convert canvas to PNG buffer: ${bufferError.message}`,
          );
        }

        // Optimize image with Sharp for better OCR results
        if (sharp) {
          try {
            console.log(
              `[OCR] [PDF-TO-IMAGE] Optimizing page ${pageNum} image with Sharp...`,
            );
            // Enhance image for OCR:
            // - Ensure minimum DPI (300 DPI is good for OCR)
            // - Convert to grayscale (can improve OCR accuracy)
            // - Increase contrast slightly
            // - Ensure proper PNG format
            const originalSize = imageBuffer.length;
            imageBuffer = await sharp(imageBuffer)
              .greyscale(false) // Keep color for now, some invoices have colored text
              .normalize() // Enhance contrast
              .png({ quality: 100, compressionLevel: 1 }) // High quality PNG
              .toBuffer();

            console.log(
              `[OCR] [PDF-TO-IMAGE] Page ${pageNum} optimized: ${(originalSize / 1024).toFixed(2)} KB -> ${(imageBuffer.length / 1024).toFixed(2)} KB (${viewport.width}x${viewport.height}px)`,
            );
          } catch (sharpError: any) {
            console.warn(
              `[OCR] [PDF-TO-IMAGE] Sharp optimization failed for page ${pageNum}, using original:`,
              sharpError.message,
            );
            // Continue with original buffer if Sharp fails
          }
        } else {
          console.log(
            `[OCR] [PDF-TO-IMAGE] Page ${pageNum} converted: ${(imageBuffer.length / 1024).toFixed(2)} KB (${viewport.width}x${viewport.height}px)`,
          );
        }

        // Validate image buffer
        if (!imageBuffer || imageBuffer.length === 0) {
          throw new Error(
            `Failed to generate image buffer for page ${pageNum}`,
          );
        }

        // Basic PNG header validation (PNG files start with specific bytes: 89 50 4E 47)
        const pngHeader = imageBuffer.slice(0, 4);
        const isValidPng =
          imageBuffer.length >= 8 &&
          imageBuffer[0] === 0x89 &&
          imageBuffer[1] === 0x50 &&
          imageBuffer[2] === 0x4e &&
          imageBuffer[3] === 0x47;

        if (!isValidPng) {
          console.warn(
            `[OCR] [PDF-TO-IMAGE] ⚠️ Warning: Page ${pageNum} image buffer may not be a valid PNG. ` +
              `First 4 bytes: ${Array.from(pngHeader)
                .map((b) => '0x' + b.toString(16).padStart(2, '0'))
                .join(' ')}. ` +
              `Size: ${imageBuffer.length} bytes`,
          );
        } else {
          console.log(
            `[OCR] [PDF-TO-IMAGE] ✓ Page ${pageNum} PNG header validated`,
          );
        }

        // Warn if image is suspiciously small (might indicate rendering issue)
        const imageSizeKB = imageBuffer.length / 1024;
        if (imageSizeKB < 10) {
          console.warn(
            `[OCR] [PDF-TO-IMAGE] ⚠️ Warning: Page ${pageNum} image is very small (${imageSizeKB.toFixed(2)} KB). This might indicate a rendering problem.`,
          );
        }

        // Save image for debugging
        const imageFilename = originalFileName
          ? `${originalFileName.replace(/\.pdf$/i, '')}_page_${pageNum}.png`
          : `page_${pageNum}.png`;

        const savedPath = await this.saveDebugImage(
          imageBuffer,
          imageFilename,
          {
            pageNumber: pageNum,
            width: viewport.width,
            height: viewport.height,
            scale: 3.0,
            sizeKB: imageSizeKB,
            isValidPng: isValidPng,
            originalFileName: originalFileName,
          },
        );

        if (savedPath) {
          console.log(
            `[OCR] [PDF-TO-IMAGE] ✓ Saved debug image for page ${pageNum}: ${savedPath}`,
          );
        }

        imageBuffers.push(imageBuffer);
      }

      if (imageBuffers.length === 0) {
        throw new Error('No images were generated from PDF pages');
      }

      console.log(
        `[OCR] Successfully converted ${imageBuffers.length} page(s) to images`,
      );

      return imageBuffers;
    } catch (error: any) {
      console.error('[OCR] Error converting PDF to images:', error.message);
      console.error('[OCR] Stack trace:', error.stack);
      throw new Error(
        `Failed to convert PDF pages to images: ${error.message}`,
      );
    }
  }

  /**
   * Extract text from PDF buffer using pdf-parse
   */
  private async extractTextFromPdf(buffer: Buffer): Promise<string> {
    let pdfParse: any;

    try {
      // Try dynamic import first (ES modules)
      try {
        const pdfParseModule = await import('pdf-parse');
        pdfParse = pdfParseModule.default || pdfParseModule;
      } catch {
        // Fallback to require (CommonJS)
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        pdfParse = require('pdf-parse');
      }
    } catch (error) {
      throw new Error(
        `Failed to load pdf-parse module: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    // pdf-parse v2.4.5 exports an object with PDFParse class constructor
    const PDFParseClass = pdfParse.PDFParse || pdfParse.default?.PDFParse;

    if (!PDFParseClass || typeof PDFParseClass !== 'function') {
      throw new Error(
        `PDFParse class not found in pdf-parse module. Please ensure pdf-parse package is properly installed.`,
      );
    }

    // Convert buffer to Uint8Array (pdf-parse v2.4.5 requires Uint8Array)
    const uint8Array = new Uint8Array(buffer);

    // Create a new instance of PDFParse with the Uint8Array
    const parser = new PDFParseClass(uint8Array);

    // Call getText() method to extract text from PDF
    // The result can be an object with a 'text' property or the text directly
    const result = await parser.getText();
    let text = '';

    if (typeof result === 'string') {
      text = result;
    } else if (result && typeof result === 'object' && 'text' in result) {
      text = result.text || '';
    } else if (result) {
      // Try to convert to string if it's something else
      text = String(result);
    }

    return text || '';
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

    // Improved vendor name extraction
    if (nonEmptyLines.length > 0) {
      // Patterns to skip (addresses, phone numbers, dates, etc.)
      const skipPatterns = [
        /^[\d\s\-\.\/]+$/, // Only numbers, spaces, dashes, dots, slashes
        /^(street|avenue|road|city|state|zip|p\.?o\.?\s*box|po box)/i,
        /^(phone|tel|mobile|fax|email|e-mail)[\s:]/i,
        /^(date|invoice\s*date|bill\s*date)[\s:]/i,
        /^(invoice|bill|receipt|tax\s*invoice)[\s#:]/i,
        /^(total|subtotal|amount|vat|tax)[\s:]/i,
        /^[\d]{1,2}[\/\-][\d]{1,2}[\/\-][\d]{2,4}$/, // Date patterns
        /^[A-Z]{2,3}\s*[\d,]+\.?\d*$/, // Currency codes with amounts
        /^[\d,]+\.?\d*\s*(AED|USD|EUR|GBP|SAR)$/i, // Amounts with currency
        /^(qty|quantity|item|description|unit|price)[\s:]/i,
        /^TRN[\s:]/i,
        /^[A-Z0-9]{10,20}$/, // TRN numbers
      ];

      // Look for vendor name in first 10 lines (usually at top)
      const searchLines = nonEmptyLines.slice(
        0,
        Math.min(10, nonEmptyLines.length),
      );

      // Priority 1: Look for company/business name patterns
      const companyPatterns = [
        /^(LLC|L\.L\.C\.|LTD|L\.T\.D\.|INC|INC\.|CORP|CORP\.|CO\.|COMPANY)/i,
        /(LLC|L\.L\.C\.|LTD|L\.T\.D\.|INC|INC\.|CORP|CORP\.|CO\.|COMPANY)/i,
      ];

      // Try to find full company name first (lines with LLC, LTD, etc.)
      let fullCompanyName: string | null = null; // eslint-disable-line prefer-const

      for (const line of searchLines) {
        const trimmed = line.trim();
        // Skip if matches skip patterns
        if (skipPatterns.some((p) => p.test(trimmed))) {
          continue;
        }

        // Check if line looks like a company name
        const hasCompanyIndicator = companyPatterns.some((p) =>
          p.test(trimmed),
        );
        const hasMultipleWords = trimmed.split(/\s+/).length >= 2;
        const reasonableLength = trimmed.length >= 3 && trimmed.length <= 100;
        const hasLetters = /[A-Za-z]/.test(trimmed);

        // Additional check: if it's a short name (1-4 words) and appears early, it might be the vendor
        const wordCount = trimmed.split(/\s+/).length;
        const isShortName = wordCount >= 1 && wordCount <= 4;
        const isEarlyLine = searchLines.indexOf(line) < 5; // First 5 lines
        const isAllCapsOrTitleCase =
          /^[A-Z][A-Z\s]+$/.test(trimmed) ||
          /^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/.test(trimmed);

        // If it has company indicators or looks like a business name
        // Also accept short names that appear early (likely vendor name like "BEST GRID")
        if (
          hasLetters &&
          reasonableLength &&
          (hasCompanyIndicator ||
            hasMultipleWords ||
            (isShortName && isEarlyLine && isAllCapsOrTitleCase))
        ) {
          // Clean up the vendor name
          let vendorName = trimmed
            .replace(/\s+/g, ' ') // Normalize whitespace
            .substring(0, 100);

          // Remove common suffixes that might be OCR errors (but keep if it's part of the name)
          vendorName = vendorName.replace(/\s+(LLC|LTD|INC|CORP|CO)\.?$/i, '');

          result.vendorName = vendorName;
          break;
        }
      }

      // Use full company name if found, otherwise use the short name we found
      if (fullCompanyName && !result.vendorName) {
        result.vendorName = fullCompanyName;
      }

      // Priority 2: If no company name found, take first substantial line
      if (!result.vendorName) {
        for (const line of searchLines) {
          const trimmed = line.trim();
          if (skipPatterns.some((p) => p.test(trimmed))) {
            continue;
          }

          // Must have letters, reasonable length, and multiple words or substantial content
          const hasLetters = /[A-Za-z]/.test(trimmed);
          const reasonableLength = trimmed.length >= 3 && trimmed.length <= 100;
          const hasSubstance =
            trimmed.split(/\s+/).length >= 1 && trimmed.length >= 5;

          // Don't skip lines that are just vendor names (like "BEST GRID")
          // All caps with spaces (common for company names in invoices)
          const isLikelyVendorName =
            trimmed.length >= 5 &&
            trimmed.length <= 50 &&
            /^[A-Z\s]+$/.test(trimmed) && // All caps with spaces
            trimmed.split(/\s+/).length >= 1 &&
            trimmed.split(/\s+/).length <= 5;

          if (
            hasLetters &&
            reasonableLength &&
            (hasSubstance || isLikelyVendorName)
          ) {
            result.vendorName = trimmed.substring(0, 100);
            break;
          }
        }
      }
    }

    // Extract invoice number (look for patterns like INV-123, #12345, BILL ID, TI/BG/L2163-23/YI, etc.)
    const invoicePatterns = [
      /(?:invoice\s*reference\s*no\.?|invoice\s*ref\s*no\.?)[\s:]*([A-Z0-9\/\-]+)/i,
      /(?:invoice|inv|receipt|bill)[\s#:]*([A-Z0-9\/\-]+)/i,
      /(?:bill\s*id|invoice\s*no\.?|receipt\s*no\.?)[\s:]*([A-Z0-9\/\-]+)/i,
      /#\s*([A-Z0-9\/\-]+)/i,
      /(?:no\.?|number)[\s:]*([A-Z0-9\/\-]+)/i,
    ];
    for (const pattern of invoicePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        result.invoiceNumber = match[1].trim();
        break;
      }
    }

    // Extract TRN (Tax Registration Number) - UAE format is typically 15 digits
    const trnPatterns = [
      /(?:trn|tax\s*registration\s*number|vat\s*number|tax\s*id)[\s:#]*([A-Z0-9]{10,20})/i,
      /(?:registration\s*no|reg\s*no)[\s:]*([A-Z0-9]{10,20})/i,
      /\b([A-Z0-9]{15})\b/, // UAE TRN is typically 15 alphanumeric characters (fixed: was 0-Z, should be A-Z0-9)
      /TRN[\s:#]*([A-Z0-9]{10,20})/i, // Added # to handle "TRN#"
      /TRN#\s*([A-Z0-9]{10,20})/i, // Explicit pattern for "TRN#"
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
    // Priority order: Grand Total > Total Amount > Total > Amount > largest number with currency

    interface AmountMatch {
      value: number;
      priority: number;
      lineIndex: number;
      context: string; // Store context for debugging
    }

    const amounts: AmountMatch[] = [];

    // Enhanced amount patterns with priorities
    // Priority 1: Grand Total, Total Amount, Final Total (highest priority)
    const highPriorityPatterns = [
      {
        pattern:
          /(?:grand\s*)?total\s*(?:amount)?\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
        priority: 10,
      },
      {
        pattern: /(?:final\s*)?total\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
        priority: 9,
      },
      {
        pattern:
          /total\s*(?:amount|due|payable)?\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
        priority: 8,
      },
      // Add pattern for "Total:" or "Total " followed by amount on same or next line
      {
        pattern: /total\s*[:\s]+([\d,]+\.?\d*)/gi,
        priority: 8,
      },
      // Pattern for amounts in table format (common in invoices)
      {
        pattern: /(?:total|amount)\s*[\s:]*([\d,]+\.?\d{2})/gi,
        priority: 8,
      },
    ];

    // Priority 2: Total on same line or next line
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      const lowerLine = line.toLowerCase();

      // Check for "Total" keyword
      if (/^(?:grand\s*)?total\s*(?:amount)?\s*[:\s]*$/i.test(line)) {
        // Total is on this line, amount might be on next line
        if (i + 1 < allLines.length) {
          const nextLine = allLines[i + 1].trim();
          // Match amount with optional currency
          const amountMatch = nextLine.match(
            /^(?:AED\s*)?([\d,]+\.?\d*)\s*(?:AED)?$/i,
          );
          if (amountMatch) {
            const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0 && amount < 1000000) {
              amounts.push({
                value: amount,
                priority: lowerLine.includes('grand') ? 10 : 8,
                lineIndex: i,
                context: line,
              });
            }
          }
        }
      } else if (
        /^(?:grand\s*)?total\s*(?:amount)?\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/i.test(
          line,
        )
      ) {
        // Total and amount on same line
        const match = line.match(
          /^(?:grand\s*)?total\s*(?:amount)?\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/i,
        );
        if (match && match[1]) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            amounts.push({
              value: amount,
              priority: lowerLine.includes('grand') ? 10 : 8,
              lineIndex: i,
              context: line,
            });
          }
        }
      }
    }

    // Search for high priority patterns in text
    for (const { pattern, priority } of highPriorityPatterns) {
      try {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0 && amount < 1000000) {
              // Find line index for this match
              const matchIndex =
                text.substring(0, match.index || 0).split('\n').length - 1;
              amounts.push({
                value: amount,
                priority,
                lineIndex: matchIndex,
                context: '',
              });
            }
          }
        }
      } catch {
        // Fallback: use match() if matchAll fails
        const match = text.match(pattern);
        if (match && match[1]) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            amounts.push({
              value: amount,
              priority,
              lineIndex: 0,
              context: '',
            });
          }
        }
      }
    }

    // Priority 3: Amount line patterns
    const amountPatterns = [
      {
        pattern:
          /(?:^|\n)\s*amount\s*(?:due|payable)?\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
        priority: 5,
      },
      {
        pattern:
          /(?:^|\n)\s*pay\s*(?:amount|total)?\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
        priority: 5,
      },
    ];

    for (const { pattern, priority } of amountPatterns) {
      try {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0 && amount < 1000000) {
              const matchIndex =
                text.substring(0, match.index || 0).split('\n').length - 1;
              amounts.push({
                value: amount,
                priority,
                lineIndex: matchIndex,
                context: '',
              });
            }
          }
        }
      } catch {
        const match = text.match(pattern);
        if (match && match[1]) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            amounts.push({
              value: amount,
              priority,
              lineIndex: 0,
              context: '',
            });
          }
        }
      }
    }

    // Priority 4: Look for amounts in table-like structures (common in invoices)
    // Look for lines that have numbers with 2 decimal places (likely amounts)
    const tableAmountPattern = /^[\s]*([\d,]+\.\d{2})[\s]*$/gm;
    try {
      const matches = text.matchAll(tableAmountPattern);
      for (const match of matches) {
        if (match[1]) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          // Only consider substantial amounts (likely not line items)
          if (!isNaN(amount) && amount >= 10 && amount < 1000000) {
            const matchIndex =
              text.substring(0, match.index || 0).split('\n').length - 1;
            // Check if this line is near "total" keywords (higher priority)
            const lineContext = allLines[Math.max(0, matchIndex - 2)]
              .concat(' ', allLines[matchIndex] || '')
              .concat(
                ' ',
                allLines[Math.min(allLines.length - 1, matchIndex + 2)] || '',
              )
              .toLowerCase();
            const priority = /total|amount|due|payable/.test(lineContext)
              ? 6
              : 2;
            amounts.push({
              value: amount,
              priority: priority,
              lineIndex: matchIndex,
              context: lineContext.substring(0, 50),
            });
          }
        }
      }
    } catch {
      // Fallback if matchAll fails
    }

    // Priority 5: Currency patterns (AED, USD, etc.) - lower priority
    const currencyPatterns = [
      /(?:AED|USD|\$|€|£|SAR)\s*([\d,]+\.?\d*)/gi,
      /([\d,]+\.?\d*)\s*(?:AED|USD|SAR)/gi,
    ];

    for (const pattern of currencyPatterns) {
      try {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          if (match[1]) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            if (!isNaN(amount) && amount > 0 && amount < 1000000) {
              const matchIndex =
                text.substring(0, match.index || 0).split('\n').length - 1;
              amounts.push({
                value: amount,
                priority: 1,
                lineIndex: matchIndex,
                context: '',
              });
            }
          }
        }
      } catch {
        const match = text.match(pattern);
        if (match && match[1]) {
          const amount = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 0 && amount < 1000000) {
            amounts.push({
              value: amount,
              priority: 1,
              lineIndex: 0,
              context: '',
            });
          }
        }
      }
    }

    if (amounts.length > 0) {
      // Sort by priority (descending), then by line index (descending - later in document)
      amounts.sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return b.lineIndex - a.lineIndex; // Prefer amounts appearing later in document
      });

      // Use the highest priority amount, or if same priority, the largest one
      const topPriority = amounts[0].priority;
      const topPriorityAmounts = amounts.filter(
        (a) => a.priority === topPriority,
      );

      if (topPriorityAmounts.length === 1) {
        result.amount = topPriorityAmounts[0].value;
      } else {
        // If multiple amounts with same priority, use the largest (usually the final total)
        result.amount = Math.max(...topPriorityAmounts.map((a) => a.value));
      }

      console.log(
        `[OCR] Extracted amount: ${result.amount} from ${amounts.length} potential amounts`,
      );
    } else {
      // Fallback: Look for any substantial number in the text (last resort)
      console.log(
        '[OCR] No amounts found with patterns, trying fallback extraction',
      );
      const allNumbers = text.match(/([\d,]+\.?\d{0,2})/g);
      if (allNumbers) {
        const parsedNumbers = allNumbers
          .map((n) => parseFloat(n.replace(/,/g, '')))
          .filter((n) => !isNaN(n) && n >= 10 && n < 1000000)
          .sort((a, b) => b - a); // Sort descending

        if (parsedNumbers.length > 0) {
          // Use the largest number found (likely the total)
          result.amount = parsedNumbers[0];
          console.log(
            `[OCR] Fallback: Using largest number found: ${result.amount}`,
          );
        }
      }
    }

    // Try to find VAT/Tax - improved patterns (only if amount was found)
    if (result.amount) {
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
                const parsedYear =
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
                year = parsedYear;
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
        } catch {
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
