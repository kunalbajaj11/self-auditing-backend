import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LicenseKeysService } from './license-keys.service';
import { LicenseKeysController } from './license-keys.controller';
import { LicenseKey } from '../../entities/license-key.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LicenseKey])],
  providers: [LicenseKeysService],
  controllers: [LicenseKeysController],
  exports: [LicenseKeysService],
})
export class LicenseKeysModule {}

