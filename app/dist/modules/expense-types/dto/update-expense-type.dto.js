"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateExpenseTypeDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const create_expense_type_dto_1 = require("./create-expense-type.dto");
class UpdateExpenseTypeDto extends (0, mapped_types_1.PartialType)(create_expense_type_dto_1.CreateExpenseTypeDto) {
}
exports.UpdateExpenseTypeDto = UpdateExpenseTypeDto;
//# sourceMappingURL=update-expense-type.dto.js.map