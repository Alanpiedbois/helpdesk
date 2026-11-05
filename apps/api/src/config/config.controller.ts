import { Controller, Get } from '@nestjs/common';
import { LlmService } from '../ai/llm.service.js';
import { Public } from '../auth/decorators.js';

/** Feature flags for the front end, so the UI hides what the server cannot do. */
@Public()
@Controller('config')
export class ConfigController {
  constructor(private readonly llm: LlmService) {}

  @Get()
  get(): { ai: boolean } {
    return { ai: this.llm.enabled };
  }
}
