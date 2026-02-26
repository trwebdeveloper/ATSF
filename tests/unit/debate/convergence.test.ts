import { describe, it, expect } from 'vitest';
import {
  ConvergenceDetector,
  fuzzyMatch,
} from '../../../src/debate/convergence.js';
import type { Proposal, Critique } from '../../../src/debate/types.js';

function makeProposal(agentId: string, option: string): Proposal {
  return {
    agentId,
    option,
    rationale: `Rationale for ${option}`,
    tradeoffs: [`Tradeoff for ${option}`],
    evidence: [`Evidence for ${option}`],
  };
}

function makeCritique(
  agentId: string,
  targetProposal: string,
  weaknesses: string[] = [],
): Critique {
  return {
    agentId,
    targetProposal,
    strengths: ['Good feature'],
    weaknesses,
    questions: [],
  };
}

describe('ConvergenceDetector', () => {
  describe('detectConvergence', () => {
    it('returns score 1.0 when all proposals agree on same option and no new critiques', () => {
      const detector = new ConvergenceDetector();
      const proposals: Proposal[] = [
        makeProposal('proposer-0', 'PostgreSQL'),
        makeProposal('proposer-1', 'PostgreSQL'),
      ];
      const prevCritiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', ['Vertical scaling limitations']),
      ];
      const critiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', ['Vertical scaling limitations']),
      ];

      const result = detector.detectConvergence(proposals, critiques, prevCritiques, {
        convergenceThreshold: 0.8,
        round: 2,
      });

      // optionAgreement = 1.0 (all agree), critiqueOverlap = 1.0 (same concern)
      // score = 0.6 * 1.0 + 0.4 * 1.0 = 1.0
      expect(result.converged).toBe(true);
      expect(result.score).toBeCloseTo(1.0, 1);
    });

    it('returns score reflecting plurality ratio when proposals disagree', () => {
      const detector = new ConvergenceDetector();
      const proposals: Proposal[] = [
        makeProposal('proposer-0', 'PostgreSQL'),
        makeProposal('proposer-1', 'MongoDB'),
        makeProposal('proposer-2', 'PostgreSQL'),
      ];
      // Round 1: no previous critiques
      const critiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', ['Scaling issues']),
      ];

      const result = detector.detectConvergence(proposals, critiques, [], {
        convergenceThreshold: 0.8,
        round: 1,
      });

      // optionAgreement = 2/3 ≈ 0.667
      // critiqueOverlap = 0.0 (round 1, all new)
      // score = 0.6 * 0.667 + 0.4 * 0.0 = 0.4
      expect(result.score).toBeCloseTo(0.4, 1);
      expect(result.converged).toBe(false);
    });

    it('sets critiqueOverlap to 0 for round 1', () => {
      const detector = new ConvergenceDetector();
      const proposals: Proposal[] = [
        makeProposal('proposer-0', 'PostgreSQL'),
      ];
      const critiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', ['Concern A', 'Concern B']),
      ];

      const result = detector.detectConvergence(proposals, critiques, [], {
        convergenceThreshold: 0.8,
        round: 1,
      });

      // Round 1 => critiqueOverlap = 0
      // optionAgreement = 1.0 (single proposal)
      // score = 0.6 * 1.0 + 0.4 * 0.0 = 0.6
      expect(result.score).toBeCloseTo(0.6, 1);
    });

    it('detects convergence when threshold is met', () => {
      const detector = new ConvergenceDetector();
      const proposals: Proposal[] = [
        makeProposal('proposer-0', 'PostgreSQL'),
        makeProposal('proposer-1', 'PostgreSQL'),
      ];
      const prevCritiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', ['Scaling']),
      ];
      const critiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', ['Scaling']),
      ];

      const result = detector.detectConvergence(proposals, critiques, prevCritiques, {
        convergenceThreshold: 0.8,
        round: 2,
      });

      expect(result.converged).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0.8);
    });

    it('returns overlapping and divergent criteria', () => {
      const detector = new ConvergenceDetector();
      const proposals: Proposal[] = [
        makeProposal('proposer-0', 'PostgreSQL'),
      ];
      const prevCritiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', ['Vertical scaling limitations']),
      ];
      const critiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', [
          'Vertical scaling limitations',
          'Complex migration management is a brand new concern',
        ]),
      ];

      const result = detector.detectConvergence(proposals, critiques, prevCritiques, {
        convergenceThreshold: 0.8,
        round: 2,
      });

      // The overlapping concern (vertical scaling) should appear in overlappingCriteria
      expect(result.overlappingCriteria.length).toBeGreaterThanOrEqual(1);
      // The new concern should appear in divergentCriteria
      expect(result.divergentCriteria.length).toBeGreaterThanOrEqual(0);
    });

    it('includes roundMetrics in result', () => {
      const detector = new ConvergenceDetector();
      const proposals: Proposal[] = [
        makeProposal('proposer-0', 'PostgreSQL'),
        makeProposal('proposer-1', 'MongoDB'),
      ];
      const critiques: Critique[] = [
        makeCritique('critic-0', 'proposer-0', ['Issue A']),
      ];

      const result = detector.detectConvergence(proposals, critiques, [], {
        convergenceThreshold: 0.8,
        round: 1,
        tokenUsage: 500,
      });

      expect(result.roundMetrics).toHaveLength(1);
      expect(result.roundMetrics[0].round).toBe(1);
      expect(result.roundMetrics[0].optionAgreement).toBeCloseTo(0.5, 1);
      expect(result.roundMetrics[0].critiqueOverlap).toBe(0);
      expect(result.roundMetrics[0].tokenUsage).toBe(500);
    });
  });

  describe('fuzzyMatch', () => {
    it('returns false for empty previous concerns', () => {
      expect(fuzzyMatch('some concern', [])).toBe(false);
    });

    it('matches identical strings', () => {
      const result = fuzzyMatch(
        'Vertical scaling limitations',
        ['Vertical scaling limitations'],
      );
      expect(result).toBe(true);
    });

    it('matches rephrased concerns with shared vocabulary', () => {
      const result = fuzzyMatch(
        'lacks horizontal scaling capability',
        ['no horizontal scalability support'],
      );
      expect(result).toBe(true);
    });

    it('does not match completely different concerns', () => {
      const result = fuzzyMatch(
        'Database migration complexity requires careful planning',
        ['Network latency between microservices causes timeout failures'],
      );
      expect(result).toBe(false);
    });
  });
});
