import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@cka/auth-kit';

/**
 * Two probes with different jobs — mixing them up is a classic outage:
 *
 * - /healthz (liveness): "is the process alive?" No dependencies checked. If
 *   it checked the database, a database blip would make Kubernetes restart
 *   every pod at once, turning a short outage into a long one.
 * - /readyz (readiness): "can I serve traffic now?" Checks the database. When
 *   it fails, Kubernetes removes the pod from the Service endpoints but does
 *   not restart it.
 */
@ApiExcludeController()
@SkipThrottle()
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get('healthz')
  liveness() {
    return { status: 'ok' };
  }

  @Get('readyz')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.db.pingCheck('database', { timeout: 2_000 })]);
  }
}
