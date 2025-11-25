import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../modules/users/users.service';
export declare class AppBootstrapService implements OnModuleInit {
    private readonly configService;
    private readonly usersService;
    private readonly logger;
    constructor(configService: ConfigService, usersService: UsersService);
    onModuleInit(): Promise<void>;
}
