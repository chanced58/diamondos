import { battedBallPayloadFields, createBattedBallSlot } from '../batted-ball-fields';

describe('battedBallPayloadFields', () => {
  it('should write no field at all when the scorer skipped', () => {
    const fields = battedBallPayloadFields(null);
    expect(fields).toEqual({});
    expect(Object.keys(fields)).toHaveLength(0);
  });

  it('should record the location and the first fielder', () => {
    expect(battedBallPayloadFields({ sprayX: 0.36, sprayY: 0.58, firstFielder: 6 })).toEqual({
      sprayX: 0.36,
      sprayY: 0.58,
      fieldingSequence: [6],
    });
  });

  it('should omit fieldingSequence when no fielder touched it', () => {
    const fields = battedBallPayloadFields({ sprayX: 0.5, sprayY: 1, firstFielder: null });
    expect(fields).toEqual({ sprayX: 0.5, sprayY: 1 });
    expect(fields).not.toHaveProperty('fieldingSequence');
  });

  it('should record the full throw sequence when one was tapped', () => {
    expect(
      battedBallPayloadFields({ sprayX: 0.36, sprayY: 0.58, firstFielder: 6 }, [6, 3]).fieldingSequence,
    ).toEqual([6, 3]);
  });

  it('should copy the throw sequence rather than keep a reference to it', () => {
    const throws = [6, 3];
    const fields = battedBallPayloadFields({ sprayX: 0.36, sprayY: 0.58, firstFielder: 6 }, throws);
    throws.push(1);
    expect(fields.fieldingSequence).toEqual([6, 3]);
  });
});

describe('createBattedBallSlot', () => {
  it('should hand the fields out once and then be empty', () => {
    const slot = createBattedBallSlot();
    slot.set({ sprayX: 0.5, sprayY: 0.9, fieldingSequence: [8] });
    expect(slot.take()).toEqual({ sprayX: 0.5, sprayY: 0.9, fieldingSequence: [8] });
    expect(slot.take()).toEqual({});
  });

  it('should drop fields that are cleared before anything takes them', () => {
    const slot = createBattedBallSlot();
    slot.set({ sprayX: 0.5, sprayY: 0.9 });
    slot.clear();
    expect(slot.take()).toEqual({});
  });
});
