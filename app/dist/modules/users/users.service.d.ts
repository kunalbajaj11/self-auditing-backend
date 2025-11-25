import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeUserStatusDto } from './dto/change-status.dto';
import { UserRole } from '../../common/enums/user-role.enum';
import { Organization } from '../../entities/organization.entity';
import { UserStatus } from '../../common/enums/user-status.enum';
export declare class UsersService {
    private readonly usersRepository;
    private readonly organizationsRepository;
    constructor(usersRepository: Repository<User>, organizationsRepository: Repository<Organization>);
    findByEmail(email: string): Promise<User | null>;
    findById(id: string): Promise<User>;
    findAllByOrganization(organizationId: string, options?: {
        includeStatuses?: UserStatus[];
    }): Promise<User[]>;
    createSuperAdmin(dto: CreateUserDto): Promise<User>;
    createForOrganization(organizationId: string, dto: CreateUserDto, roleScope: UserRole[]): Promise<User>;
    updateUser(userId: string, organizationId: string, dto: UpdateUserDto): Promise<User>;
    changeStatus(userId: string, organizationId: string, dto: ChangeUserStatusDto): Promise<User>;
    setRefreshToken(userId: string, tokenHash: string): Promise<void>;
    clearRefreshToken(userId: string): Promise<void>;
    recordLogin(userId: string): Promise<void>;
}
