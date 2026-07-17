import { Module } from '@nestjs/common';
import { ContactCentreService } from './contact-centre.service';
import { ContactCentreController } from './contact-centre.controller';

@Module({
  controllers: [ContactCentreController],
  providers: [ContactCentreService],
  exports: [ContactCentreService],
})
export class ContactCentreModule {}
