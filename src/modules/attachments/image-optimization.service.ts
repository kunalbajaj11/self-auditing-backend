import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sharp from 'sharp';

export interface OptimizationResult {
  buffer: Buffer;
  optimized: boolean;
  originalSize: number;
  optimizedSize: number;
  width?: number;
  height?: number;
}

@Injectable()
export class ImageOptimizationService {
  private readonly logger = new Logger(ImageOptimizationService.name);
  
  // Maximum width for images (preserves aspect ratio)
  private readonly maxWidth: number;
  // JPEG quality (1-100, higher = better quality but larger file)
  private readonly jpegQuality: number;
  // PNG quality (1-100)
  private readonly pngQuality: number;
  // WebP quality (1-100)
  private readonly webpQuality: number;
  // Enable optimization (can be disabled via config)
  private readonly enabled: boolean;

  // Supported image MIME types
  private readonly supportedImageTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]);

  constructor(private readonly configService: ConfigService) {
    // Configuration from environment variables with sensible defaults
    // Parse as numbers since env vars are strings
    this.maxWidth = parseInt(this.configService.get<string>('IMAGE_MAX_WIDTH', '2000'), 10);
    this.jpegQuality = parseInt(this.configService.get<string>('IMAGE_JPEG_QUALITY', '85'), 10);
    this.pngQuality = parseInt(this.configService.get<string>('IMAGE_PNG_QUALITY', '90'), 10);
    this.webpQuality = parseInt(this.configService.get<string>('IMAGE_WEBP_QUALITY', '85'), 10);
    this.enabled = this.configService.get<string>('IMAGE_OPTIMIZATION_ENABLED', 'true').toLowerCase() === 'true';
    
    this.logger.log(
      `Image optimization service initialized: enabled=${this.enabled}, maxWidth=${this.maxWidth}, jpegQuality=${this.jpegQuality}`,
    );
  }

  /**
   * Check if the file is an image that should be optimized
   */
  isImageFile(mimeType: string): boolean {
    if (!mimeType) return false;
    const normalizedMimeType = mimeType.toLowerCase();
    return this.supportedImageTypes.has(normalizedMimeType);
  }

  /**
   * Optimize an image buffer
   * @param buffer Original image buffer
   * @param mimeType Image MIME type
   * @returns Optimized image buffer and metadata
   */
  async optimizeImage(
    buffer: Buffer,
    mimeType: string,
  ): Promise<OptimizationResult> {
    const originalSize = buffer.length;

    // If optimization is disabled, return original
    if (!this.enabled) {
      this.logger.debug('Image optimization is disabled, skipping optimization');
      return {
        buffer,
        optimized: false,
        originalSize,
        optimizedSize: originalSize,
      };
    }

    // Check if it's an image file
    if (!this.isImageFile(mimeType)) {
      this.logger.debug(`File is not an image type (${mimeType}), skipping optimization`);
      return {
        buffer,
        optimized: false,
        originalSize,
        optimizedSize: originalSize,
      };
    }

    try {
      // Get image metadata to check dimensions
      const metadata = await sharp(buffer).metadata();
      const originalWidth = metadata.width || 0;
      const originalHeight = metadata.height || 0;

      this.logger.debug(
        `Optimizing image: type=${mimeType}, originalSize=${originalSize} bytes, dimensions=${originalWidth}x${originalHeight}`,
      );

      // Build sharp pipeline
      let sharpInstance = sharp(buffer);

      // Resize if image is larger than max width (preserve aspect ratio)
      if (originalWidth > this.maxWidth) {
        sharpInstance = sharpInstance.resize(this.maxWidth, null, {
          withoutEnlargement: true,
          fit: 'inside',
        });
        this.logger.debug(`Resizing image from ${originalWidth}px to max ${this.maxWidth}px width`);
      }

      // Apply format-specific optimizations
      const normalizedMimeType = mimeType.toLowerCase();
      let optimizedBuffer: Buffer;
      let finalWidth: number | undefined;
      let finalHeight: number | undefined;

      if (normalizedMimeType === 'image/jpeg' || normalizedMimeType === 'image/jpg') {
        optimizedBuffer = await sharpInstance
          .jpeg({ 
            quality: this.jpegQuality,
            progressive: true, // Progressive JPEG for better perceived performance
            mozjpeg: true, // Use mozjpeg for better compression
          })
          .toBuffer();
        
        const finalMetadata = await sharp(optimizedBuffer).metadata();
        finalWidth = finalMetadata.width;
        finalHeight = finalMetadata.height;
      } else if (normalizedMimeType === 'image/png') {
        optimizedBuffer = await sharpInstance
          .png({ 
            compressionLevel: 9, // Maximum compression (0-9, higher = better compression)
            adaptiveFiltering: true, // Better compression
          })
          .toBuffer();
        
        const finalMetadata = await sharp(optimizedBuffer).metadata();
        finalWidth = finalMetadata.width;
        finalHeight = finalMetadata.height;
      } else if (normalizedMimeType === 'image/webp') {
        optimizedBuffer = await sharpInstance
          .webp({ 
            quality: this.webpQuality,
            effort: 6, // Higher effort = better compression (0-6)
          })
          .toBuffer();
        
        const finalMetadata = await sharp(optimizedBuffer).metadata();
        finalWidth = finalMetadata.width;
        finalHeight = finalMetadata.height;
      } else {
        // Unknown image type, return original
        this.logger.warn(`Unknown image type: ${mimeType}, returning original`);
        return {
          buffer,
          optimized: false,
          originalSize,
          optimizedSize: originalSize,
        };
      }

      const optimizedSize = optimizedBuffer.length;
      const savingsPercent = ((originalSize - optimizedSize) / originalSize) * 100;

      this.logger.log(
        `Image optimized: ${originalSize} bytes -> ${optimizedSize} bytes (${savingsPercent.toFixed(1)}% reduction), dimensions=${finalWidth}x${finalHeight}`,
      );

      return {
        buffer: optimizedBuffer,
        optimized: true,
        originalSize,
        optimizedSize,
        width: finalWidth,
        height: finalHeight,
      };
    } catch (error) {
      // If optimization fails, log error and return original buffer
      this.logger.error(
        `Failed to optimize image: ${(error as Error)?.message}. Returning original image.`,
        (error as Error)?.stack,
      );
      return {
        buffer,
        optimized: false,
        originalSize,
        optimizedSize: originalSize,
      };
    }
  }

  /**
   * Get the recommended settings for OCR-friendly images
   * This ensures images are optimized but still maintain OCR accuracy
   */
  getOcrRecommendedSettings(): {
    maxWidth: number;
    jpegQuality: number;
    minDpi: number;
  } {
    return {
      maxWidth: this.maxWidth,
      jpegQuality: this.jpegQuality,
      minDpi: 200, // Recommended minimum DPI for OCR (we maintain original DPI if possible)
    };
  }
}


