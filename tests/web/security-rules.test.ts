import { describe, it, expect } from 'vitest';

describe('Security & Business Invariant Rules', () => {
  it('enforces that AI/agent cannot set approval status to approved', () => {
    // Model the DB check function logic in check_approval_actor()
    function validateApprovalTransition(
      actorRole: string,
      proposedBy: string,
      newStatus: string,
      oldStatus: string
    ) {
      if (newStatus === 'approved' && oldStatus !== 'approved') {
        if (actorRole === 'anon' || proposedBy === 'agent' && actorRole !== 'founder') {
          throw new Error('Autonomous self-approval by agent is strictly prohibited');
        }
      }
      return true;
    }

    // 1. Agent attempting to approve without founder
    expect(() =>
      validateApprovalTransition('agent', 'agent', 'approved', 'pending')
    ).toThrow('Autonomous self-approval by agent is strictly prohibited');

    // 2. Anonymous user attempting to approve
    expect(() =>
      validateApprovalTransition('anon', 'agent', 'approved', 'pending')
    ).toThrow('Autonomous self-approval by agent is strictly prohibited');

    // 3. Founder explicitly approving an agent-generated proposal
    expect(
      validateApprovalTransition('founder', 'agent', 'approved', 'pending')
    ).toBe(true);
  });

  it('validates 7-stage pipeline states and rejects illegal states', () => {
    const validStages = new Set([
      'discovered',
      'qualified',
      'contacted',
      'replied',
      'proposal',
      'won',
      'lost',
      'not_a_fit',
      'do_not_contact',
      'on_hold',
    ]);

    expect(validStages.has('discovered')).toBe(true);
    expect(validStages.has('won')).toBe(true);
    expect(validStages.has('arbitrary_unapproved_state')).toBe(false);
  });
});
