import { SetMetadata } from '@nestjs/common';

export const LICENSE_FEATURE_KEY = 'licenseFeature';

/**
 * Decorator to restrict access based on license features
 * @param feature The feature name that must be enabled ('payroll' | 'inventory' | 'bulkJournalImport')
 * @example @RequireLicenseFeature('payroll')
 */
export const RequireLicenseFeature = (
  feature: 'payroll' | 'inventory' | 'bulkJournalImport',
) => SetMetadata(LICENSE_FEATURE_KEY, feature);
