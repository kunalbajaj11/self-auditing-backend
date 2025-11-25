export interface AuthenticatedUser {
    userId: string;
    email: string;
    role: string;
    organizationId?: string | null;
}
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
