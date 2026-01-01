import { Module, Global } from '@nestjs/common';
import { RegionConfigService } from './region-config.service';

@Global()
@Module({
  providers: [RegionConfigService],
  exports: [RegionConfigService],
})
export class RegionConfigModule {}
