import { describe, expect, it } from 'vitest';
import { injuryOutlook } from './injuryOutlook';

describe('injuryOutlook', () => {
  it('does not infer a specific diagnosis from a generic knee designation', () => {
    const outlook = injuryOutlook('Knee', undefined, 'Questionable');
    expect(outlook?.name).toContain('diagnosis unspecified');
    expect(outlook?.typicalRecovery).toContain('No responsible healing-time estimate');
  });

  it('uses diagnosis-specific MCL ranges when the note identifies an MCL injury', () => {
    const outlook = injuryOutlook('Knee', 'Grade 2 MCL sprain', 'Out');
    expect(outlook?.name).toBe('MCL sprain/tear');
    expect(outlook?.typicalRecovery).toContain('4–6 weeks');
    expect(outlook?.recurrence).toContain('prior MCL tear');
  });

  it('flags the elevated recurrence sensitivity of hamstring injuries', () => {
    const outlook = injuryOutlook('Hamstring', undefined, 'Questionable');
    expect(outlook?.name).toBe('Hamstring strain/injury');
    expect(outlook?.recurrence.toLowerCase()).toContain('recurrence');
    expect(outlook?.sourceUrls.length).toBeGreaterThan(0);
  });

  it('distinguishes high ankle injuries from routine ankle sprains', () => {
    const high = injuryOutlook('Ankle', 'high ankle sprain', 'Out');
    const routine = injuryOutlook('Ankle', 'lateral ankle sprain', 'Questionable');
    expect(high?.name).toContain('High ankle');
    expect(routine?.typicalRecovery).toContain('6–12 weeks');
  });

  it('provides a conservative fallback for unknown injury labels', () => {
    const outlook = injuryOutlook('Undisclosed', undefined, 'Questionable');
    expect(outlook?.typicalRecovery).toContain('No reliable healing-time estimate');
    expect(outlook?.recurrence).toContain('cannot be estimated responsibly');
  });
});
