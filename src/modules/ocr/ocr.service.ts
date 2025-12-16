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
   * Note: Google Vision API's textDetection does NOT support PDFs directly.
   * We first try to extract text using pdf-parse, then use Google Vision API
   * on the first page converted to image if available, or fall back to text extraction.
   */
  private async processPdfWithGoogleVision(
    file: Express.Multer.File,
    organizationId?: string,
  ): Promise<OcrResult> {
    console.log('[OCR] Processing PDF file');

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
    // Convert PDF pages to images
    const pageImages = await this.convertPdfPagesToImages(file.buffer);

    if (pageImages.length === 0) {
      throw new Error('Failed to convert PDF pages to images');
    }

    console.log(`[OCR] Converted ${pageImages.length} PDF page(s) to images`);

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

        primaryResult = await this.processWithGoogleVision(
          imageFile,
          organizationId,
        );
        primaryText = primaryResult.fields?.fullText || '';
        totalConfidence = primaryResult.confidence || 0;
        processedPages.add(invoicePageIndex);

        allDetections.push({
          page: invoicePageIndex + 1,
          confidence: primaryResult.confidence,
          pageType: 'invoice',
          isPrimary: true,
        });

        console.log(
          `[OCR] Successfully processed invoice page with ${primaryText.length} characters`,
        );
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
      throw new Error('No text extracted from PDF pages');
    }

    // Parse the text (prioritizing invoice page if available)
    const parsed = this.parseOcrText(primaryText);

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
   * Convert PDF pages to image buffers using pdfjs-dist
   */
  private async convertPdfPagesToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
    try {
      // Dynamically import pdfjs-dist
      let pdfjsLib: any;
      try {
        const pdfjsModule = await import('pdfjs-dist');
        pdfjsLib = pdfjsModule.default || pdfjsModule;
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        pdfjsLib = require('pdfjs-dist');
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
        const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better OCR quality

        // Create canvas
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        // Render PDF page to canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        // Convert canvas to buffer
        const imageBuffer = canvas.toBuffer('image/png');
        imageBuffers.push(imageBuffer);

        console.log(
          `[OCR] Converted page ${pageNum} to image (${imageBuffer.length} bytes)`,
        );
      }

      return imageBuffers;
    } catch (error: any) {
      console.error('[OCR] Error converting PDF to images:', error.message);
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

        // If it has company indicators or looks like a business name
        if (
          hasLetters &&
          reasonableLength &&
          (hasCompanyIndicator || hasMultipleWords)
        ) {
          // Clean up the vendor name
          let vendorName = trimmed
            .replace(/\s+/g, ' ') // Normalize whitespace
            .substring(0, 100);

          // Remove common suffixes that might be OCR errors
          vendorName = vendorName.replace(/\s+(LLC|LTD|INC|CORP|CO)\.?$/i, '');

          result.vendorName = vendorName;
          break;
        }
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

          if (hasLetters && reasonableLength && hasSubstance) {
            result.vendorName = trimmed.substring(0, 100);
            break;
          }
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
