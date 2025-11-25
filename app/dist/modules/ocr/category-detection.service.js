"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryDetectionService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const category_entity_1 = require("../../entities/category.entity");
let CategoryDetectionService = class CategoryDetectionService {
    constructor(categoriesRepository, configService) {
        this.categoriesRepository = categoriesRepository;
        this.configService = configService;
        this.categoryKeywords = {
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
    }
    async detectCategory(ocrText, organizationId) {
        if (!ocrText || ocrText.trim().length === 0) {
            return null;
        }
        const categories = await this.categoriesRepository.find({
            where: {
                organization: { id: organizationId },
                isDeleted: false,
            },
        });
        if (categories.length === 0) {
            return null;
        }
        const normalizedText = ocrText.toLowerCase();
        const matches = [];
        for (const category of categories) {
            const categoryName = category.name.toLowerCase();
            const keywords = this.categoryKeywords[category.name] || [];
            let score = 0;
            const matchedKeywords = [];
            if (normalizedText.includes(categoryName)) {
                score += 10;
                matchedKeywords.push(categoryName);
            }
            for (const keyword of keywords) {
                if (normalizedText.includes(keyword.toLowerCase())) {
                    score += 5;
                    matchedKeywords.push(keyword);
                }
            }
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
        if (matches.length > 0) {
            matches.sort((a, b) => b.score - a.score);
            const bestMatch = matches[0];
            if (bestMatch.score >= 5) {
                console.log(`Category detected: ${bestMatch.category.name} (score: ${bestMatch.score}, keywords: ${bestMatch.matchedKeywords.join(', ')})`);
                return bestMatch.category;
            }
        }
        return null;
    }
    async detectCategoryWithAI(ocrText, vendorName, organizationId) {
        const openaiApiKey = this.configService.get('OPENAI_API_KEY');
        if (!openaiApiKey) {
            return this.detectCategory(ocrText, organizationId);
        }
        try {
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
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
            });
            if (!response.ok) {
                console.warn('OpenAI API error, falling back to keyword matching');
                return this.detectCategory(ocrText, organizationId);
            }
            const data = await response.json();
            const suggestedCategory = data.choices[0]?.message?.content?.trim();
            if (suggestedCategory) {
                const matchedCategory = categories.find((c) => c.name.toLowerCase() === suggestedCategory.toLowerCase());
                if (matchedCategory) {
                    console.log(`AI detected category: ${matchedCategory.name}`);
                    return matchedCategory;
                }
            }
            return this.detectCategory(ocrText, organizationId);
        }
        catch (error) {
            console.error('Error using AI for category detection:', error);
            return this.detectCategory(ocrText, organizationId);
        }
    }
};
exports.CategoryDetectionService = CategoryDetectionService;
exports.CategoryDetectionService = CategoryDetectionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(category_entity_1.Category)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        config_1.ConfigService])
], CategoryDetectionService);
//# sourceMappingURL=category-detection.service.js.map