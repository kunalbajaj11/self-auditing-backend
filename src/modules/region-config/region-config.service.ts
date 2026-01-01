import { Injectable } from '@nestjs/common';
import { Region } from '../../common/enums/region.enum';
import { RegionConfig } from '../../config/region-config.interface';
import { REGION_CONFIGS } from '../../config/region-config.config';

@Injectable()
export class RegionConfigService {
  /**
   * Get region configuration for a specific region
   * @param region The region to get configuration for
   * @returns Region configuration or UAE defaults if region is null/undefined
   */
  getConfig(region?: Region | null): RegionConfig {
    const effectiveRegion = region || Region.UAE;
    return REGION_CONFIGS[effectiveRegion] || REGION_CONFIGS[Region.UAE];
  }

  /**
   * Get default currency for a region
   */
  getDefaultCurrency(region?: Region | null): string {
    return this.getConfig(region).defaultCurrency;
  }

  /**
   * Get base currency for a region
   */
  getBaseCurrency(region?: Region | null): string {
    return this.getConfig(region).baseCurrency;
  }

  /**
   * Get tax authority for a region
   */
  getTaxAuthority(region?: Region | null): string {
    return this.getConfig(region).taxAuthority;
  }

  /**
   * Get default tax rate for a region
   */
  getDefaultTaxRate(region?: Region | null): number {
    return this.getConfig(region).defaultTaxRate;
  }

  /**
   * Get supported currencies for a region
   */
  getSupportedCurrencies(region?: Region | null): string[] {
    return this.getConfig(region).supportedCurrencies;
  }

  /**
   * Get app brand name for a region
   */
  getAppBrandName(region?: Region | null): string {
    return this.getConfig(region).appBrandName;
  }

  /**
   * Get email brand name for a region
   */
  getEmailBrandName(region?: Region | null): string {
    return this.getConfig(region).emailBrandName;
  }
}
