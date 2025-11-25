import { UsersService } from './users.service';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeUserStatusDto } from './dto/change-status.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    me(user: AuthenticatedUser): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        organization: {
            id: string;
            name: string;
        };
        status: import("../../common/enums/user-status.enum").UserStatus;
        lastLogin: Date;
    }>;
    list(user: AuthenticatedUser): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        phone: string;
        status: import("../../common/enums/user-status.enum").UserStatus;
        lastLogin: Date;
    }[]>;
    create(user: AuthenticatedUser, dto: CreateUserDto): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        phone: string;
        status: import("../../common/enums/user-status.enum").UserStatus;
    }>;
    update(id: string, user: AuthenticatedUser, dto: UpdateUserDto): Promise<{
        id: string;
        name: string;
        email: string;
        role: UserRole;
        phone: string;
        status: import("../../common/enums/user-status.enum").UserStatus;
    }>;
    changeStatus(id: string, user: AuthenticatedUser, dto: ChangeUserStatusDto): Promise<{
        id: string;
        status: import("../../common/enums/user-status.enum").UserStatus;
    }>;
}
