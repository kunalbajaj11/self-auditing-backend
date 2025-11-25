import { CategoriesService } from './categories.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
export declare class CategoriesController {
    private readonly categoriesService;
    constructor(categoriesService: CategoriesService);
    list(user: AuthenticatedUser, expenseType?: string): Promise<import("../../entities/category.entity").Category[]>;
    create(user: AuthenticatedUser, dto: CreateCategoryDto): Promise<import("../../entities/category.entity").Category>;
    update(id: string, user: AuthenticatedUser, dto: UpdateCategoryDto): Promise<import("../../entities/category.entity").Category>;
    remove(id: string, user: AuthenticatedUser): Promise<{
        success: boolean;
    }>;
}
