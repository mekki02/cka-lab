import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '@cka/auth-kit';
import { KubeService } from '../kube/kube.service';

/**
 * /healthz: the process is alive (no dependencies).
 * /readyz:  the lab cluster's API answers — without it nothing here works.
 */
@ApiExcludeController()
@Public()
@Controller()
export class HealthController {
  constructor(private readonly kube: KubeService) {}

  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async readiness() {
    try {
      await this.kube.core.getAPIResources();
      return { status: 'ok' };
    } catch (err) {
      throw new ServiceUnavailableException(`Lab cluster unreachable: ${(err as Error).message}`);
    }
  }
}
