import { Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';
import { Organization } from '../../entities/organization.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { User } from '../../entities/user.entity';
export declare class CategoriesService {
    private readonly categoriesRepository;
    private readonly organizationsRepository;
    private readonly usersRepository;
    constructor(categoriesRepository: Repository<Category>, organizationsRepository: Repository<Organization>, usersRepository: Repository<User>);
    ensureDefaultsForOrganization(organizationId: string): Promise<void>;
    findAllByOrganization(organizationId: string, expenseType?: string): Promise<Category[]>;
    create(organizationId: string, createdById: string, dto: CreateCategoryDto): Promise<Category>;
    update(categoryId: string, organizationId: string, dto: UpdateCategoryDto): Promise<Category>;
    remove(categoryId: string, organizationId: string): Promise<void>;
}
