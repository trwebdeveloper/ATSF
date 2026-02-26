/**
 * Cross-Reference Validator — T13
 *
 * Implements 13 cross-reference rules per Section 10.8.
 * Validates consistency between ATSF output artifacts.
 */

import type {
  TaskGraphArtifact,
  RepoBlueprint,
  Mpd,
  Ticket,
  AiPromptPack,
  Adr,
} from '../contracts/artifact-schemas.js';

/* ------------------------------------------------------------------ */
/*  Public interfaces (spec Section 10.8.3)                            */
/* ------------------------------------------------------------------ */

export interface CrossRefViolation {
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warning';
  message: string;
  offendingValues: string[];
}

export interface CrossRefValidationResult {
  valid: boolean;
  errors: CrossRefViolation[];
  warnings: CrossRefViolation[];
}

/**
 * ArtifactSet holds deserialized + Zod-validated artifact data.
 * taskGraph is the parsed TaskGraphArtifact (Section 10.7.2), not the
 * in-memory DAG from Section 5.3. The emitter pipeline produces
 * TaskGraphArtifact; the cross-reference validator consumes it here.
 */
export interface ArtifactSet {
  taskGraph: TaskGraphArtifact;
  repoBlueprint: RepoBlueprint;
  mpd: Mpd;
  tickets: Ticket[];
  promptPacks: AiPromptPack[];
  adrs: Adr[];
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Flatten all file nodes from a repo blueprint into their full relative paths.
 * Traverses the tree recursively accumulating path segments.
 */
function flattenRepoBlueprintPaths(
  nodes: RepoBlueprint['root'],
  prefix = '',
): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'file') {
      paths.push(fullPath);
    }
    if (node.children && node.children.length > 0) {
      paths.push(...flattenRepoBlueprintPaths(node.children, fullPath));
    }
  }
  return paths;
}

/**
 * Collect all generatedBy values from all file nodes (recursively).
 */
function collectGeneratedBy(
  nodes: RepoBlueprint['root'],
): string[] {
  const result: string[] = [];
  for (const node of nodes) {
    if (node.generatedBy) {
      result.push(node.generatedBy);
    }
    if (node.children && node.children.length > 0) {
      result.push(...collectGeneratedBy(node.children));
    }
  }
  return result;
}

/**
 * Collect all taskRefs from MPD sections that have them.
 * Per XREF-007, covers: componentDesign.components[].taskRefs,
 * testingStrategy.taskRefs, timeline.phases[].taskRefs, and api endpoints/security threats.
 */
function collectMpdTaskRefs(mpd: Mpd): string[] {
  const refs: string[] = [];

  // componentDesign.components[].taskRefs
  for (const comp of mpd.componentDesign?.components ?? []) {
    refs.push(...comp.taskRefs);
  }

  // testingStrategy.taskRefs
  if (mpd.testingStrategy?.taskRefs) {
    refs.push(...mpd.testingStrategy.taskRefs);
  }

  // timeline.phases[].taskRefs
  for (const phase of mpd.timeline?.phases ?? []) {
    refs.push(...phase.taskRefs);
  }

  // apiDesign.endpoints[].taskRef (optional)
  for (const endpoint of mpd.apiDesign?.endpoints ?? []) {
    if (endpoint.taskRef) {
      refs.push(endpoint.taskRef);
    }
  }

  // securityConsiderations.threatModel[].taskRef (optional)
  for (const threat of mpd.securityConsiderations?.threatModel ?? []) {
    if (threat.taskRef) {
      refs.push(threat.taskRef);
    }
  }

  return refs;
}

/* ------------------------------------------------------------------ */
/*  CrossReferenceValidator class                                       */
/* ------------------------------------------------------------------ */

export class CrossReferenceValidator {
  /**
   * Validate all 13 cross-reference rules against an ArtifactSet.
   * Rules with severity 'error' cause valid=false.
   * Rules with severity 'warning' populate warnings but do not affect valid.
   */
  validate(artifacts: ArtifactSet): CrossRefValidationResult {
    const errors: CrossRefViolation[] = [];
    const warnings: CrossRefViolation[] = [];

    const collect = (v: CrossRefViolation): void => {
      if (v.severity === 'error') {
        errors.push(v);
      } else {
        warnings.push(v);
      }
    };

    // Run all 13 rules
    for (const violation of this._xref001(artifacts)) collect(violation);
    for (const violation of this._xref002(artifacts)) collect(violation);
    for (const violation of this._xref003(artifacts)) collect(violation);
    for (const violation of this._xref004(artifacts)) collect(violation);
    for (const violation of this._xref005(artifacts)) collect(violation);
    for (const violation of this._xref006(artifacts)) collect(violation);
    for (const violation of this._xref007(artifacts)) collect(violation);
    for (const violation of this._xref008(artifacts)) collect(violation);
    for (const violation of this._xref009(artifacts)) collect(violation);
    for (const violation of this._xref010(artifacts)) collect(violation);
    for (const violation of this._xref011(artifacts)) collect(violation);
    for (const violation of this._xref012(artifacts)) collect(violation);
    for (const violation of this._xref013(artifacts)) collect(violation);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-001: TaskGraph-to-Tickets 1:1 mapping                      */
  /*  task_graph.tasks[].id <-> tickets.frontmatter.id                 */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref001(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskIds = new Set(artifacts.taskGraph.tasks.map(t => t.id));
    const ticketIds = new Set(artifacts.tickets.map(t => t.frontmatter.id));

    // Tasks without tickets
    const tasksWithoutTickets = [...taskIds].filter(id => !ticketIds.has(id));
    if (tasksWithoutTickets.length > 0) {
      violations.push({
        ruleId: 'XREF-001',
        ruleName: 'TaskGraph-to-Tickets 1:1 mapping',
        severity: 'error',
        message: `Tasks have no corresponding ticket: ${tasksWithoutTickets.join(', ')}`,
        offendingValues: tasksWithoutTickets,
      });
    }

    // Tickets without tasks
    const ticketsWithoutTasks = [...ticketIds].filter(id => !taskIds.has(id));
    if (ticketsWithoutTasks.length > 0) {
      violations.push({
        ruleId: 'XREF-001',
        ruleName: 'TaskGraph-to-Tickets 1:1 mapping',
        severity: 'error',
        message: `Tickets reference non-existent tasks: ${ticketsWithoutTasks.join(', ')}`,
        offendingValues: ticketsWithoutTasks,
      });
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-002: TaskGraph-to-PromptPack 1:1 mapping                   */
  /*  task_graph.tasks[].id <-> ai_prompt_pack.taskId                  */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref002(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskIds = new Set(artifacts.taskGraph.tasks.map(t => t.id));
    const packTaskIds = new Set(artifacts.promptPacks.map(p => p.taskId));

    // Tasks without prompt packs
    const tasksWithoutPacks = [...taskIds].filter(id => !packTaskIds.has(id));
    if (tasksWithoutPacks.length > 0) {
      violations.push({
        ruleId: 'XREF-002',
        ruleName: 'TaskGraph-to-PromptPack 1:1 mapping',
        severity: 'error',
        message: `Tasks have no corresponding prompt pack: ${tasksWithoutPacks.join(', ')}`,
        offendingValues: tasksWithoutPacks,
      });
    }

    // Prompt packs referencing non-existent tasks
    const packsWithoutTasks = [...packTaskIds].filter(id => !taskIds.has(id));
    if (packsWithoutTasks.length > 0) {
      violations.push({
        ruleId: 'XREF-002',
        ruleName: 'TaskGraph-to-PromptPack 1:1 mapping',
        severity: 'error',
        message: `Prompt packs reference non-existent tasks: ${packsWithoutTasks.join(', ')}`,
        offendingValues: packsWithoutTasks,
      });
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-003: RepoBlueprint generatedBy references TaskGraph        */
  /*  repo_blueprint.root[].generatedBy -> task_graph.tasks[].id      */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref003(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskIds = new Set(artifacts.taskGraph.tasks.map(t => t.id));
    const generatedByValues = collectGeneratedBy(artifacts.repoBlueprint.root);

    const invalid = generatedByValues.filter(id => !taskIds.has(id));
    if (invalid.length > 0) {
      violations.push({
        ruleId: 'XREF-003',
        ruleName: 'RepoBlueprint generatedBy references TaskGraph',
        severity: 'error',
        message: `RepoBlueprint generatedBy references non-existent tasks: ${invalid.join(', ')}`,
        offendingValues: invalid,
      });
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-004: Ticket dependencies match TaskGraph dependsOn         */
  /*  tickets.frontmatter.dependencies -> task_graph.tasks[].dependsOn */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref004(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskIds = new Set(artifacts.taskGraph.tasks.map(t => t.id));
    const taskDepsMap = new Map(
      artifacts.taskGraph.tasks.map(t => [t.id, new Set(t.dependsOn)]),
    );

    for (const ticket of artifacts.tickets) {
      const ticketId = ticket.frontmatter.id;
      const ticketDeps = ticket.frontmatter.dependencies;

      // Check all ticket dependency references exist in task graph
      const invalidRefs = ticketDeps.filter(dep => !taskIds.has(dep));
      if (invalidRefs.length > 0) {
        violations.push({
          ruleId: 'XREF-004',
          ruleName: 'Ticket dependencies match TaskGraph dependsOn',
          severity: 'error',
          message: `Ticket ${ticketId} references non-existent task dependencies: ${invalidRefs.join(', ')}`,
          offendingValues: invalidRefs,
        });
        continue; // Skip consistency check if refs are invalid
      }

      // Check ticket deps are consistent with task graph deps
      const taskDeps = taskDepsMap.get(ticketId);
      if (taskDeps === undefined) {
        // Ticket for unknown task -- handled by XREF-001
        continue;
      }

      const ticketDepsSet = new Set(ticketDeps);

      // Find deps in task graph that are not in ticket
      const missingInTicket = [...taskDeps].filter(dep => !ticketDepsSet.has(dep));
      // Find deps in ticket that are not in task graph
      const extraInTicket = [...ticketDepsSet].filter(dep => !taskDeps.has(dep));

      const mismatch = [...missingInTicket, ...extraInTicket];
      if (mismatch.length > 0) {
        violations.push({
          ruleId: 'XREF-004',
          ruleName: 'Ticket dependencies match TaskGraph dependsOn',
          severity: 'error',
          message: `Ticket ${ticketId} dependencies do not match task graph dependsOn. Missing: [${missingInTicket.join(', ')}], Extra: [${extraInTicket.join(', ')}]`,
          offendingValues: mismatch,
        });
      }
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-005: PromptPack inputFiles.sourceTask references TaskGraph  */
  /*  ai_prompt_pack.inputFiles[].sourceTask -> task_graph.tasks[].id  */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref005(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskIds = new Set(artifacts.taskGraph.tasks.map(t => t.id));

    for (const pack of artifacts.promptPacks) {
      const invalid = pack.inputFiles
        .map(f => f.sourceTask)
        .filter(id => !taskIds.has(id));

      if (invalid.length > 0) {
        violations.push({
          ruleId: 'XREF-005',
          ruleName: 'PromptPack inputFiles.sourceTask references TaskGraph',
          severity: 'error',
          message: `PromptPack for ${pack.taskId} has inputFiles with non-existent sourceTask references: ${invalid.join(', ')}`,
          offendingValues: invalid,
        });
      }
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-006: PromptPack previousTaskOutputs.taskId references TaskGraph */
  /*  ai_prompt_pack.previousTaskOutputs[].taskId -> task_graph.tasks[].id */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref006(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskIds = new Set(artifacts.taskGraph.tasks.map(t => t.id));

    for (const pack of artifacts.promptPacks) {
      const invalid = pack.previousTaskOutputs
        .map(p => p.taskId)
        .filter(id => !taskIds.has(id));

      if (invalid.length > 0) {
        violations.push({
          ruleId: 'XREF-006',
          ruleName: 'PromptPack previousTaskOutputs.taskId references TaskGraph',
          severity: 'error',
          message: `PromptPack for ${pack.taskId} has previousTaskOutputs with non-existent taskId references: ${invalid.join(', ')}`,
          offendingValues: invalid,
        });
      }
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-007: MPD taskRefs reference TaskGraph                      */
  /*  mpd.*.taskRefs[] -> task_graph.tasks[].id                       */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref007(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskIds = new Set(artifacts.taskGraph.tasks.map(t => t.id));
    const allMpdTaskRefs = collectMpdTaskRefs(artifacts.mpd);

    const invalid = allMpdTaskRefs.filter(id => !taskIds.has(id));
    if (invalid.length > 0) {
      violations.push({
        ruleId: 'XREF-007',
        ruleName: 'MPD taskRefs reference TaskGraph',
        severity: 'error',
        message: `MPD taskRefs reference non-existent tasks: ${invalid.join(', ')}`,
        offendingValues: invalid,
      });
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-008: MPD ADR refs match Appendices                         */
  /*  mpd.technicalArchitecture.patterns[].adrRef -> mpd.appendices.adrs[].id */
  /*  Severity: warning                                                */
  /* ---------------------------------------------------------------- */
  private _xref008(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const appendixAdrIds = new Set((artifacts.mpd.appendices?.adrs ?? []).map(a => a.id));

    const invalid: string[] = [];
    for (const pattern of artifacts.mpd.technicalArchitecture?.patterns ?? []) {
      if (pattern.adrRef && !appendixAdrIds.has(pattern.adrRef)) {
        invalid.push(pattern.adrRef);
      }
    }

    if (invalid.length > 0) {
      violations.push({
        ruleId: 'XREF-008',
        ruleName: 'MPD ADR refs match Appendices',
        severity: 'warning',
        message: `MPD pattern adrRefs do not match appendices.adrs: ${invalid.join(', ')}`,
        offendingValues: invalid,
      });
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-009: Ticket relatedDecisions reference ADRs                */
  /*  tickets.body.relatedDecisions -> adrs[].id (from ArtifactSet)   */
  /*  Severity: warning                                                */
  /* ---------------------------------------------------------------- */
  private _xref009(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const adrIds = new Set(artifacts.adrs.map(a => a.id));

    const invalid: string[] = [];
    for (const ticket of artifacts.tickets) {
      for (const adrRef of ticket.body.relatedDecisions) {
        if (!adrIds.has(adrRef)) {
          invalid.push(adrRef);
        }
      }
    }

    if (invalid.length > 0) {
      violations.push({
        ruleId: 'XREF-009',
        ruleName: 'Ticket relatedDecisions reference ADRs',
        severity: 'warning',
        message: `Ticket relatedDecisions reference ADRs not found in ArtifactSet: ${invalid.join(', ')}`,
        offendingValues: invalid,
      });
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-010: PromptPack outputFiles match TaskGraph filesWrite      */
  /*  ai_prompt_pack.contract.outputFiles[].filePath -> task_graph.tasks[].filesWrite */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref010(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskFilesWriteMap = new Map(
      artifacts.taskGraph.tasks.map(t => [t.id, new Set(t.filesWrite)]),
    );

    for (const pack of artifacts.promptPacks) {
      const taskFilesWrite = taskFilesWriteMap.get(pack.taskId);
      if (!taskFilesWrite) {
        // Task not found -- handled by XREF-002
        continue;
      }

      const invalid = pack.contract.outputFiles
        .map(f => f.filePath)
        .filter(fp => !taskFilesWrite.has(fp));

      if (invalid.length > 0) {
        violations.push({
          ruleId: 'XREF-010',
          ruleName: 'PromptPack contract.outputFiles match TaskGraph filesWrite',
          severity: 'error',
          message: `PromptPack for ${pack.taskId} has outputFiles not in task filesWrite: ${invalid.join(', ')}`,
          offendingValues: invalid,
        });
      }
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-011: PromptPack inputFiles match TaskGraph filesRead        */
  /*  ai_prompt_pack.inputFiles[].filePath -> task_graph.tasks[].filesRead */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref011(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskFilesReadMap = new Map(
      artifacts.taskGraph.tasks.map(t => [t.id, new Set(t.filesRead)]),
    );

    for (const pack of artifacts.promptPacks) {
      const taskFilesRead = taskFilesReadMap.get(pack.taskId);
      if (!taskFilesRead) {
        // Task not found -- handled by XREF-002
        continue;
      }

      const invalid = pack.inputFiles
        .map(f => f.filePath)
        .filter(fp => !taskFilesRead.has(fp));

      if (invalid.length > 0) {
        violations.push({
          ruleId: 'XREF-011',
          ruleName: 'PromptPack inputFiles.filePath match TaskGraph filesRead',
          severity: 'error',
          message: `PromptPack for ${pack.taskId} has inputFiles not in task filesRead: ${invalid.join(', ')}`,
          offendingValues: invalid,
        });
      }
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-012: MPD criticalPath tasks exist in TaskGraph             */
  /*  mpd.timeline.criticalPath -> task_graph.tasks[].id              */
  /*  Severity: error                                                   */
  /* ---------------------------------------------------------------- */
  private _xref012(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];
    const taskIds = new Set(artifacts.taskGraph.tasks.map(t => t.id));

    const invalid = (artifacts.mpd.timeline?.criticalPath ?? []).filter(id => !taskIds.has(id));
    if (invalid.length > 0) {
      violations.push({
        ruleId: 'XREF-012',
        ruleName: 'MPD timeline.criticalPath tasks exist in TaskGraph',
        severity: 'error',
        message: `MPD criticalPath references non-existent tasks: ${invalid.join(', ')}`,
        offendingValues: invalid,
      });
    }

    return violations;
  }

  /* ---------------------------------------------------------------- */
  /*  XREF-013: RepoBlueprint files cover TaskGraph filesWrite         */
  /*  repo_blueprint (flattened) -> task_graph.tasks[].filesWrite (union) */
  /*  Severity: warning                                                */
  /* ---------------------------------------------------------------- */
  private _xref013(artifacts: ArtifactSet): CrossRefViolation[] {
    const violations: CrossRefViolation[] = [];

    // Collect all filesWrite from all tasks (union)
    const allFilesWrite = new Set<string>();
    for (const task of artifacts.taskGraph.tasks) {
      for (const fp of task.filesWrite) {
        allFilesWrite.add(fp);
      }
    }

    // Flatten all file paths from the repo blueprint
    const repoPaths = new Set(flattenRepoBlueprintPaths(artifacts.repoBlueprint.root));

    // Find filesWrite paths not covered by repo blueprint
    const uncovered = [...allFilesWrite].filter(fp => !repoPaths.has(fp));
    if (uncovered.length > 0) {
      violations.push({
        ruleId: 'XREF-013',
        ruleName: 'RepoBlueprint files cover TaskGraph filesWrite',
        severity: 'warning',
        message: `Task filesWrite paths not found in RepoBlueprint: ${uncovered.join(', ')}`,
        offendingValues: uncovered,
      });
    }

    return violations;
  }
}

/* ------------------------------------------------------------------ */
/*  Standalone function (spec Section 10.8.3)                          */
/* ------------------------------------------------------------------ */

/**
 * Standalone function wrapper for CrossReferenceValidator.
 * Equivalent to `new CrossReferenceValidator().validate(artifacts)`.
 */
export function validateCrossReferences(artifacts: ArtifactSet): CrossRefValidationResult {
  return new CrossReferenceValidator().validate(artifacts);
}
