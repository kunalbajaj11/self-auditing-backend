import { Column, Entity } from 'typeorm';
import { AbstractEntity } from './abstract.entity';

@Entity({ name: 'contacts' })
export class Contact extends AbstractEntity {
  @Column({ length: 100 })
  name: string;

  @Column({ length: 100 })
  email: string;

  @Column({ length: 20, nullable: true })
  phone?: string | null;

  @Column({ length: 150, nullable: true })
  company?: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'replied_at', type: 'timestamp', nullable: true })
  repliedAt?: Date | null;
}
