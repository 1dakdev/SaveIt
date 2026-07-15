import { Body, Controller, Get, Injectable, Param, Post, Module, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

class PostMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

@Injectable()
class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  post(circleId: string, authorId: string, body: string) {
    return this.prisma.message.create({
      data: { circleId, authorId, body, kind: 'member' },
    });
  }

  /** System messages (e.g. "period closed") carry no author. */
  system(circleId: string, body: string) {
    return this.prisma.message.create({ data: { circleId, body, kind: 'system' } });
  }

  list(circleId: string) {
    return this.prisma.message.findMany({
      where: { circleId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

@Controller('circles/:id/messages')
@UseGuards(AuthGuard)
class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  post(@Param('id') circleId: string, @CurrentUser() userId: string, @Body() dto: PostMessageDto) {
    return this.chat.post(circleId, userId, dto.body);
  }

  @Get()
  list(@Param('id') circleId: string) {
    return this.chat.list(circleId);
  }
}

@Module({
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
