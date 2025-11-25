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
exports.OcrService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const vision_1 = require("@google-cloud/vision");
const path = require("path");
const category_detection_service_1 = require("./category-detection.service");
let OcrService = class OcrService {
    constructor(configService, categoryDetectionService) {
        this.configService = configService;
        this.categoryDetectionService = categoryDetectionService;
    }
    async process(file, organizationId) {
        const provider = this.configService.get('OCR_PROVIDER', 'mock');
        switch (provider.toLowerCase()) {
            case 'google':
                return this.processWithGoogleVision(file, organizationId);
            case 'azure':
                return this.processWithAzureFormRecognizer(file, organizationId);
            default:
                return this.processMock(file, organizationId);
        }
    }
    async processMock(file, organizationId) {
        const now = new Date();
        const fileName = file.originalname.toLowerCase();
        let vendorName = 'Unknown Vendor';
        let amount = 0;
        if (fileName.includes('starbucks') || fileName.includes('coffee')) {
            vendorName = 'Starbucks';
            amount = 25;
        }
        else if (fileName.includes('uber') || fileName.includes('taxi')) {
            vendorName = 'Uber';
            amount = 45;
        }
        else if (fileName.includes('amazon')) {
            vendorName = 'Amazon';
            amount = 150;
        }
        else if (fileName.includes('petrol') || fileName.includes('fuel') || fileName.includes('gas')) {
            vendorName = 'Petrol Station';
            amount = 100;
        }
        let suggestedCategoryId;
        if (organizationId) {
            const mockText = `Receipt from ${vendorName} for ${amount} AED`;
            const detectedCategory = await this.categoryDetectionService.detectCategory(mockText, organizationId);
            if (detectedCategory) {
                suggestedCategoryId = detectedCategory.id;
            }
        }
        return {
            vendorName,
            invoiceNumber: `INV-${now.getTime()}`,
            amount,
            vatAmount: amount * 0.05,
            expenseDate: now.toISOString().substring(0, 10),
            description: `Uploaded file: ${file.originalname}`,
            suggestedCategoryId,
            confidence: 0.65,
            fields: {
                originalFileName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                provider: 'mock',
                note: 'Mock OCR - Configure GOOGLE_VISION_API_KEY or AZURE_FORM_RECOGNIZER_KEY for real OCR',
            },
        };
    }
    async processWithGoogleVision(file, organizationId) {
        try {
            const credentialsPath = this.configService.get('GOOGLE_APPLICATION_CREDENTIALS') || path.join(process.cwd(), 'google-credentials.json');
            const client = new vision_1.ImageAnnotatorClient({
                keyFilename: credentialsPath,
            });
            const [result] = await client.textDetection({
                image: { content: file.buffer },
            });
            const detections = result.textAnnotations;
            if (!detections || detections.length === 0) {
                console.warn('No text detected in image. Falling back to mock.');
                return this.processMock(file);
            }
            const fullText = detections[0]?.description || '';
            const confidence = detections[0]?.confidence || 0.8;
            const parsed = this.parseOcrText(fullText);
            const description = this.buildDescription(fullText, parsed);
            let suggestedCategoryId;
            if (organizationId) {
                const detectedCategory = await this.categoryDetectionService.detectCategoryWithAI(fullText, parsed.vendorName, organizationId);
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
                expenseDate: parsed.expenseDate || new Date().toISOString().substring(0, 10),
                description: description,
                suggestedCategoryId,
                confidence: confidence,
                fields: {
                    fullText: fullText.substring(0, 500),
                    originalFileName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    provider: 'google',
                    textAnnotations: detections.length,
                },
            };
        }
        catch (error) {
            console.error('Error processing with Google Vision:', error);
            console.warn('Falling back to mock OCR.');
            return this.processMock(file, organizationId);
        }
    }
    parseOcrText(text) {
        const result = {};
        const allLines = text.split('\n');
        const nonEmptyLines = allLines.filter((line) => line.trim().length > 0);
        if (nonEmptyLines.length > 0) {
            const skipPatterns = [/^[\d\s\-]+$/, /^(street|avenue|road|city|state|zip)/i];
            for (const line of nonEmptyLines) {
                const trimmed = line.trim();
                if (trimmed.length > 2 && !skipPatterns.some(p => p.test(trimmed))) {
                    result.vendorName = trimmed.substring(0, 100);
                    break;
                }
            }
        }
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
        const trnPatterns = [
            /(?:trn|tax\s*registration\s*number|vat\s*number|tax\s*id)[\s:]*([A-Z0-9]{10,20})/i,
            /(?:registration\s*no|reg\s*no)[\s:]*([A-Z0-9]{10,20})/i,
            /\b([0-Z]{15})\b/,
            /TRN[\s:]*([A-Z0-9]{10,20})/i,
        ];
        for (const pattern of trnPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const trn = match[1].trim();
                if (trn.length >= 10 && trn.length <= 20 && /^[A-Z0-9]+$/i.test(trn)) {
                    result.vendorTrn = trn.toUpperCase();
                    break;
                }
            }
        }
        let totalAmount = null;
        for (let i = 0; i < allLines.length; i++) {
            const line = allLines[i].trim();
            if (/^total\s*[:\s]*$/i.test(line)) {
                if (i + 1 < allLines.length) {
                    const nextLine = allLines[i + 1].trim();
                    const amountMatch = nextLine.match(/^([\d,]+\.?\d*)$/);
                    if (amountMatch) {
                        totalAmount = parseFloat(amountMatch[1].replace(/,/g, ''));
                        break;
                    }
                }
            }
            else if (/^total\s*[:\s]*([\d,]+\.?\d*)/i.test(line)) {
                const match = line.match(/^total\s*[:\s]*([\d,]+\.?\d*)/i);
                if (match && match[1]) {
                    totalAmount = parseFloat(match[1].replace(/,/g, ''));
                    break;
                }
            }
        }
        const amountPatterns = [
            /(?:^|\n)\s*total\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
            /(?:^|\n)\s*amount\s*[:\s]*(?:AED\s*)?([\d,]+\.?\d*)/gi,
            /(?:AED|USD|\$|€|£)\s*([\d,]+\.?\d*)/gi,
        ];
        const amounts = [];
        if (totalAmount !== null) {
            amounts.push(totalAmount);
        }
        for (const pattern of amountPatterns) {
            try {
                const matches = text.matchAll(pattern);
                for (const match of matches) {
                    const amount = parseFloat(match[1].replace(/,/g, ''));
                    if (!isNaN(amount) && amount > 0 && amount < 1000000) {
                        amounts.push(amount);
                    }
                }
            }
            catch (error) {
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
            result.amount = Math.max(...amounts);
            const vatPatterns = [
                /(?:vat|tax)[\s:]*\(?(\d+\.?\d*)%\)?/i,
                /(?:vat|tax)[\s:]*AED?\s*([\d,]+\.?\d*)/i,
                /(?:^|\n)\s*(?:vat|tax)\s*[:\s]*\n?\s*([\d,]+\.?\d*)/gi,
                /(?:vat|tax)\s*\((\d+\.?\d*)%\)/i,
            ];
            let vatFound = false;
            for (const vatPattern of vatPatterns) {
                const vatMatch = text.match(vatPattern);
                if (vatMatch && vatMatch[1]) {
                    const vatValue = parseFloat(vatMatch[1].replace(/,/g, ''));
                    if (!isNaN(vatValue)) {
                        if (vatValue < 100 && vatValue > 0) {
                            result.vatAmount = (result.amount * vatValue) / 100;
                        }
                        else {
                            result.vatAmount = vatValue;
                        }
                        vatFound = true;
                        break;
                    }
                }
            }
            if (!vatFound) {
                const zeroTaxPattern = /(?:vat|tax)[\s:]*\(?0\.?0*%?\)?/i;
                if (zeroTaxPattern.test(text)) {
                    result.vatAmount = 0;
                }
                else {
                    for (let i = 0; i < allLines.length; i++) {
                        const line = allLines[i].trim();
                        if (/^(?:vat|tax)\s*[:\s]*$/i.test(line) && i + 1 < allLines.length) {
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
                        result.vatAmount = result.amount * 0.05;
                    }
                }
            }
        }
        const datePatterns = [
            /(?:date|dated?)[\s:]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
            /([A-Za-z]+\s+\d{1,2},?\s+\d{4})/,
            /(\d{1,2}\s+[A-Za-z]+\s+\d{4})/,
            /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
            /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
        ];
        for (const pattern of datePatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                try {
                    const dateStr = match[1].trim();
                    let date = null;
                    const monthNameMatch = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
                    if (monthNameMatch) {
                        const monthNames = {
                            'january': 0, 'jan': 0, 'february': 1, 'feb': 1,
                            'march': 2, 'mar': 2, 'april': 3, 'apr': 3,
                            'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
                            'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
                            'october': 9, 'oct': 9, 'november': 10, 'nov': 10,
                            'december': 11, 'dec': 11
                        };
                        const month = monthNames[monthNameMatch[1].toLowerCase()];
                        if (month !== undefined) {
                            const day = parseInt(monthNameMatch[2]);
                            const year = parseInt(monthNameMatch[3]);
                            date = new Date(Date.UTC(year, month, day));
                        }
                    }
                    if (!date) {
                        const dayMonthYearMatch = dateStr.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
                        if (dayMonthYearMatch) {
                            const monthNames = {
                                'january': 0, 'jan': 0, 'february': 1, 'feb': 1,
                                'march': 2, 'mar': 2, 'april': 3, 'apr': 3,
                                'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
                                'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
                                'october': 9, 'oct': 9, 'november': 10, 'nov': 10,
                                'december': 11, 'dec': 11
                            };
                            const month = monthNames[dayMonthYearMatch[2].toLowerCase()];
                            if (month !== undefined) {
                                const day = parseInt(dayMonthYearMatch[1]);
                                const year = parseInt(dayMonthYearMatch[3]);
                                date = new Date(Date.UTC(year, month, day));
                            }
                        }
                    }
                    if (!date) {
                        const standardMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
                        if (standardMatch) {
                            let day, month, year;
                            if (standardMatch[3].length === 4 && parseInt(standardMatch[1]) > 12) {
                                year = parseInt(standardMatch[1]);
                                month = parseInt(standardMatch[2]) - 1;
                                day = parseInt(standardMatch[3]);
                            }
                            else {
                                const first = parseInt(standardMatch[1]);
                                const second = parseInt(standardMatch[2]);
                                const yearStr = standardMatch[3];
                                const year = yearStr.length === 2 ? 2000 + parseInt(yearStr) : parseInt(yearStr);
                                if (first > 12) {
                                    day = first;
                                    month = second - 1;
                                }
                                else {
                                    month = first - 1;
                                    day = second;
                                }
                            }
                            date = new Date(Date.UTC(year, month, day));
                        }
                    }
                    if (!date) {
                        date = new Date(dateStr);
                        if (!isNaN(date.getTime())) {
                            const year = date.getFullYear();
                            const month = date.getMonth();
                            const day = date.getDate();
                            date = new Date(Date.UTC(year, month, day));
                        }
                    }
                    if (date && !isNaN(date.getTime()) && date.getFullYear() > 2000 && date.getFullYear() < 2100) {
                        const year = date.getUTCFullYear();
                        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                        const day = String(date.getUTCDate()).padStart(2, '0');
                        result.expenseDate = `${year}-${month}-${day}`;
                        break;
                    }
                }
                catch (e) {
                }
            }
        }
        return result;
    }
    buildDescription(fullText, parsed) {
        let description = fullText.trim();
        if (parsed.vendorName) {
            const vendorRegex = new RegExp(`^${parsed.vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\\n`, 'i');
            description = description.replace(vendorRegex, '');
        }
        if (parsed.invoiceNumber) {
            const invoicePatterns = [
                new RegExp(`(?:invoice|inv|receipt|bill|bill\\s*id)[\\s#:]*${parsed.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\\n`, 'gi'),
                new RegExp(`#\\s*${parsed.invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\\n`, 'gi'),
            ];
            invoicePatterns.forEach(pattern => {
                description = description.replace(pattern, '');
            });
        }
        if (parsed.expenseDate) {
            const datePatterns = [
                /(?:date|dated?)[\s:]*[\d\/\-\w\s,]+/gi,
                /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g,
                /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g,
                /[A-Za-z]+\s+\d{1,2},?\s+\d{4}/g,
            ];
            datePatterns.forEach(pattern => {
                description = description.replace(pattern, '');
            });
        }
        if (parsed.amount !== undefined) {
            const amountStr = parsed.amount.toString();
            const totalPattern = new RegExp(`(?:^|\\n)\\s*total\\s*[:\\s]*(?:AED\\s*)?${amountStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*?\\n`, 'gi');
            description = description.replace(totalPattern, '');
        }
        const taxPatterns = [
            /(?:vat|tax)[\s:]*\(?[\d.]+%?\)?.*?\n/gi,
            /(?:vat|tax)[\s:]*AED?\s*[\d,]+\.?\d*.*?\n/gi,
        ];
        taxPatterns.forEach(pattern => {
            description = description.replace(pattern, '');
        });
        description = description
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^\s+|\s+$/gm, '')
            .replace(/\n\s*\n/g, '\n')
            .trim();
        if (description.length > 2000) {
            description = description.substring(0, 2000) + '...';
        }
        return description || fullText.substring(0, 500);
    }
    async processWithAzureFormRecognizer(file, organizationId) {
        const endpoint = this.configService.get('AZURE_FORM_RECOGNIZER_ENDPOINT');
        const apiKey = this.configService.get('AZURE_FORM_RECOGNIZER_KEY');
        if (!endpoint || !apiKey) {
            console.warn('Azure Form Recognizer not configured. Falling back to mock.');
            return this.processMock(file, organizationId);
        }
        console.warn('Azure Form Recognizer integration not yet implemented. Using mock.');
        return this.processMock(file, organizationId);
    }
};
exports.OcrService = OcrService;
exports.OcrService = OcrService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => category_detection_service_1.CategoryDetectionService))),
    __metadata("design:paramtypes", [config_1.ConfigService,
        category_detection_service_1.CategoryDetectionService])
], OcrService);
//# sourceMappingURL=ocr.service.js.map