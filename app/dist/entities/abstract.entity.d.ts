export declare abstract class AbstractEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date | null;
    isDeleted: boolean;
}
