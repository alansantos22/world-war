import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Extrai o ID do usuario autenticado a partir do token JWT. */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.userId;
  },
);
