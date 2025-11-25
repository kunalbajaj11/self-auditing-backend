import { VendorsService, VendorFilterDto, DateFilterDto } from './vendors.service';
import { Vendor } from './vendor.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
export declare class VendorsController {
    private readonly vendorsService;
    constructor(vendorsService: VendorsService);
    list(user: AuthenticatedUser, filters: VendorFilterDto): Promise<Vendor[]>;
    search(user: AuthenticatedUser, query: string): Promise<Vendor[]>;
    topVendors(user: AuthenticatedUser, filters: DateFilterDto, limit?: string): Promise<import("./vendors.service").TopVendor[]>;
    get(user: AuthenticatedUser, id: string): Promise<Vendor>;
    getSpend(user: AuthenticatedUser, id: string, filters: DateFilterDto): Promise<import("./vendors.service").VendorSpendSummary>;
    create(user: AuthenticatedUser, dto: CreateVendorDto): Promise<Vendor>;
    update(user: AuthenticatedUser, id: string, dto: UpdateVendorDto): Promise<Vendor>;
    delete(user: AuthenticatedUser, id: string): Promise<{
        message: string;
    }>;
}
