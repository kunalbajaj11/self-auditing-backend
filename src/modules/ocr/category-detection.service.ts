import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';

interface CategoryMatch {
  category: Category;
  score: number;
  matchedKeywords: string[];
}

/**
 * Category detection service that uses keyword matching and optionally AI
 * to automatically detect expense categories from OCR text.
 */
@Injectable()
export class CategoryDetectionService {
  // Keyword mappings for common expense categories
  private readonly categoryKeywords: Record<string, string[]> = {
    Fuel: [
      'petrol',
      'gas',
      'fuel',
      'gasoline',
      'diesel',
      'petroleum',
      'adnoc',
      'eno',
      'emarat',
      'shell',
      'bp',
      'chevron',
      'filling station',
      'service station',
      'fuel station',
      'octane',
      'unleaded',
      'premium',
      'regular',
    ],
    Food: [
      'restaurant',
      'cafe',
      'coffee',
      'food',
      'dining',
      'meal',
      'starbucks',
      'mcdonald',
      'kfc',
      'pizza',
      'burger',
      'grocery',
      'supermarket',
      'hypermarket',
      'carrefour',
      'lulu',
      'bakery',
      'baker',
      'pastry',
      'sandwich',
      'lunch',
      'dinner',
    ],
    Travel: [
      'hotel',
      'flight',
      'airline',
      'taxi',
      'uber',
      'careem',
      'metro',
      'bus',
      'train',
      'travel',
      'tourism',
      'booking',
      'airport',
      'lodging',
      'accommodation',
      'reservation',
    ],
    Utilities: [
      'electricity',
      'water',
      'internet',
      'wifi',
      'broadband',
      'du',
      'etisalat',
      'dewa',
      'sewa',
      'fewa',
      'adwea',
      'utility',
      'utilities',
      'power',
      'energy',
      'gas bill',
    ],
    Telecom: [
      'phone',
      'mobile',
      'telecom',
      'telecommunication',
      'etisalat',
      'du',
      'vodafone',
      'roaming',
      'data plan',
      'calling',
      'sms',
      'prepaid',
      'postpaid',
    ],
    'Office Supplies': [
      'stationery',
      'paper',
      'pen',
      'pencil',
      'notebook',
      'printer',
      'ink',
      'cartridge',
      'folder',
      'file',
      'stapler',
      'office',
      'supplies',
      'equipment',
    ],
    Maintenance: [
      'repair',
      'maintenance',
      'service',
      'workshop',
      'garage',
      'mechanic',
      'plumber',
      'electrician',
      'carpenter',
      'fix',
      'fixing',
      'servicing',
    ],
    Entertainment: [
      'cinema',
      'movie',
      'theater',
      'concert',
      'show',
      'entertainment',
      'recreation',
      'leisure',
      'amusement',
      'ticket',
      'booking',
      'event',
    ],
    Healthcare: [
      'pharmacy',
      'pharmaceutical',
      'medicine',
      'drug',
      'clinic',
      'hospital',
      'doctor',
      'medical',
      'health',
      'prescription',
      'boots',
      'life',
      'supercare',
    ],
    Parking: [
      'parking',
      'valet',
      'garage',
      'car park',
      'parking fee',
      'parking ticket',
      'parking meter',
    ],
  };

  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Detect category from OCR text using keyword matching
   */
  async detectCategory(
    ocrText: string,
    organizationId: string,
  ): Promise<Category | null> {
    if (!ocrText || ocrText.trim().length === 0) {
      return null;
    }

    // Get all categories for the organization
    const categories = await this.categoriesRepository.find({
      where: {
        organization: { id: organizationId },
        isDeleted: false,
      },
    });

    if (categories.length === 0) {
      return null;
    }

    // Normalize OCR text for matching
    const normalizedText = ocrText.toLowerCase();

    // Find matches using keyword matching
    const matches: CategoryMatch[] = [];

    for (const category of categories) {
      const categoryName = category.name.toLowerCase();
      const keywords = this.categoryKeywords[category.name] || [];

      // Check if category name appears in text
      let score = 0;
      const matchedKeywords: string[] = [];

      if (normalizedText.includes(categoryName)) {
        score += 10;
        matchedKeywords.push(categoryName);
      }

      // Check for keyword matches
      for (const keyword of keywords) {
        if (normalizedText.includes(keyword.toLowerCase())) {
          score += 5;
          matchedKeywords.push(keyword);
        }
      }

      // Check description if available
      if (category.description) {
        const descKeywords = category.description.toLowerCase().split(/\s+/);
        for (const keyword of descKeywords) {
          if (keyword.length > 3 && normalizedText.includes(keyword)) {
            score += 2;
            matchedKeywords.push(keyword);
          }
        }
      }

      if (score > 0) {
        matches.push({
          category,
          score,
          matchedKeywords,
        });
      }
    }

    // Sort by score (highest first) and return best match
    if (matches.length > 0) {
      matches.sort((a, b) => b.score - a.score);
      const bestMatch = matches[0];

      // Only return if score is above threshold (minimum 5 points)
      if (bestMatch.score >= 5) {
        console.log(
          `Category detected: ${bestMatch.category.name} (score: ${bestMatch.score}, keywords: ${bestMatch.matchedKeywords.join(', ')})`,
        );
        return bestMatch.category;
      }
    }

    return null;
  }

  /**
   * Detect category using AI (OpenAI) if configured
   * Falls back to keyword matching if AI is not available
   */
  async detectCategoryWithAI(
    ocrText: string,
    vendorName: string | undefined,
    organizationId: string,
  ): Promise<Category | null> {
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!openaiApiKey) {
      // Fall back to keyword matching
      return this.detectCategory(ocrText, organizationId);
    }

    try {
      // Get categories for context
      const categories = await this.categoriesRepository.find({
        where: {
          organization: { id: organizationId },
          isDeleted: false,
        },
      });

      if (categories.length === 0) {
        return null;
      }

      const categoryNames = categories.map((c) => c.name).join(', ');

      // Use OpenAI to classify the expense
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: `You are an expense categorization assistant. Analyze the receipt/bill text and vendor name, then classify it into one of these categories: ${categoryNames}. Return only the category name that best matches.`,
              },
              {
                role: 'user',
                content: `Vendor: ${vendorName || 'Unknown'}\n\nReceipt Text:\n${ocrText.substring(0, 1000)}`,
              },
            ],
            max_tokens: 50,
            temperature: 0.3,
          }),
        },
      );

      if (!response.ok) {
        console.warn('OpenAI API error, falling back to keyword matching');
        return this.detectCategory(ocrText, organizationId);
      }

      const data = await response.json();
      const suggestedCategory = data.choices[0]?.message?.content?.trim();

      if (suggestedCategory) {
        const matchedCategory = categories.find(
          (c) => c.name.toLowerCase() === suggestedCategory.toLowerCase(),
        );

        if (matchedCategory) {
          console.log(`AI detected category: ${matchedCategory.name}`);
          return matchedCategory;
        }
      }

      // Fall back to keyword matching if AI didn't return a valid category
      return this.detectCategory(ocrText, organizationId);
    } catch (error) {
      console.error('Error using AI for category detection:', error);
      // Fall back to keyword matching
      return this.detectCategory(ocrText, organizationId);
    }
  }
}
