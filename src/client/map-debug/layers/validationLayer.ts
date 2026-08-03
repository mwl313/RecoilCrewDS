import { issuesFromValidationReports } from '../../../shared/mapgen/validationIssues';
import type { MapLabRenderContext } from '../layerTypes';
import { MapLabLayerBase } from '../baseLayer';
import { sphereMarker } from '../markers';

function buildIssues(ctx: MapLabRenderContext, severity: 'error' | 'warning', group: MapLabLayerBase['group']): void {
  const issues = issuesFromValidationReports(ctx.arena).filter((i) => i.severity === severity);
  const color = severity === 'error' ? 0xff3b30 : 0xffd94d;
  for (const issue of issues) {
    const p = issue.position;
    if (p) {
      group.add(sphereMarker(p.x, p.y + 0.5, p.z, severity === 'error' ? 1.6 : 1.2, color, 0.9));
    }
  }
}

export class ValidationErrorsLayer extends MapLabLayerBase {
  constructor() {
    super('validationErrors', 'Validation Errors', true);
  }
  protected build(ctx: MapLabRenderContext): void {
    buildIssues(ctx, 'error', this.group);
  }
}

export class ValidationWarningsLayer extends MapLabLayerBase {
  constructor() {
    super('validationWarnings', 'Validation Warnings', false);
  }
  protected build(ctx: MapLabRenderContext): void {
    buildIssues(ctx, 'warning', this.group);
  }
}
