import { Body, Controller, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { SubmitContactDto } from './dto/submit-contact.dto';

@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  async submitContact(@Body() dto: SubmitContactDto) {
    const contact = await this.contactService.submitContactForm(dto);
    return {
      success: true,
      message: 'Thank you for your message! We will contact you soon.',
      id: contact.id,
    };
  }
}
