import { MutableConfigStore } from '../../../src/core/config/config-store';
import { LayeredConfigStore } from '../../../src/core/config/layered-config-store';
import { SimpleMutableConfigStore } from '../../../src/core/config/simple-mutable-config-store';

describe('LayeredConfigStore', () => {
  let layeredConfig: LayeredConfigStore;

  describe('having only one underlying config store', () => {
    let underlyingConfigStore: MutableConfigStore;

    beforeEach(() => {
      underlyingConfigStore = new SimpleMutableConfigStore();
      layeredConfig = new LayeredConfigStore([underlyingConfigStore]);
    });

    it('returns false when the `has` method is called with a key that is not in the underyling config', () => {
      expect(layeredConfig.has('random_unadded_absent_key')).toBe(false);
    });

    it('returns true when the `has` method is called with a key that maps to a non-undefined value in the underyling config', () => {
      const itemKey = 'random_key';
      const itemValue = 'value for random_key';

      underlyingConfigStore.set(itemKey, itemValue);
      expect(layeredConfig.has(itemKey)).toBe(true);
    });

    it('returns true when the `has` method is called with a key that maps to the `undefined` value in the underyling config', () => {
      const itemKey = 'random_key';

      underlyingConfigStore.set(itemKey, undefined);
      expect(layeredConfig.has(itemKey)).toBe(true);
    });

    it('returns true when the `has` method is called with a key that maps to the `null` value in the underyling config', () => {
      const itemKey = 'random_key';

      underlyingConfigStore.set(itemKey, null);
      expect(layeredConfig.has(itemKey)).toBe(true);
    });

    it('returns undefined when the `get` method is called with a key that is not in the underyling config', () => {
      expect(layeredConfig.get('random_unadded_absent_key')).toBeUndefined();
    });

    it('returns the corresponding value when the `get` method is called with the key with which the value is mapped in the underyling config', () => {
      const itemKey = 'random_key';
      const itemValue = 'value for random_key';

      underlyingConfigStore.set(itemKey, itemValue);
      expect(layeredConfig.get(itemKey)).toEqual(itemValue);
    });

    describe('when the option is set to treat `undefined` values as absent', () => {
      beforeEach(() => {
        layeredConfig = new LayeredConfigStore([underlyingConfigStore], { valuesConsideredAbsent: [undefined] });
      });

      it('returns false when the `has` method is called with a key that maps to the `undefined` value in the underyling config', () => {
        const itemKey = 'random_key';

        underlyingConfigStore.set(itemKey, undefined);
        expect(layeredConfig.has(itemKey)).toBe(false);
      });
    });
  });

  describe('having more than one underlying config store', () => {
    let overridingLayerConfig: MutableConfigStore;
    let baseLayerConfig: MutableConfigStore;

    beforeEach(() => {
      overridingLayerConfig = new SimpleMutableConfigStore();
      baseLayerConfig = new SimpleMutableConfigStore();
      layeredConfig = new LayeredConfigStore([baseLayerConfig, overridingLayerConfig]);
    });

    it('returns undefined when the `get` method is called with a key that is mapped to undefined in an overriding config layer and a non-undefined value in a lower config layer', () => {
      const itemKey = 'random_key';
      baseLayerConfig.set(itemKey, 'random non-undefined value');
      overridingLayerConfig.set(itemKey, undefined);

      expect(layeredConfig.get(itemKey)).toBeUndefined();
    });

    it('returns the mapped value from the uppermost overriding config layer when the `get` method is called with a key that is mapped in multiple underyling configs', () => {
      const itemKey = 'random_key';
      const baseItemValue = 'base value for random_key';
      const overridingItemValue = 'overriding value for random_key';

      baseLayerConfig.set(itemKey, baseItemValue);
      overridingLayerConfig.set(itemKey, overridingItemValue);

      expect(layeredConfig.get(itemKey)).toEqual(overridingItemValue);
    });

    describe('when the option is set to treat `undefined` values as absent', () => {
      beforeEach(() => {
        layeredConfig = new LayeredConfigStore([baseLayerConfig, overridingLayerConfig], {
          valuesConsideredAbsent: [undefined]
        });
      });

      it('returns the first non-undefined mapped value from the uppermost overriding config layer when the `get` method is called with a key that is mapped in multiple underyling configs', () => {
        const itemKey = 'random_key';
        const baseItemValue = 'overridden base value';

        baseLayerConfig.set(itemKey, baseItemValue);
        overridingLayerConfig.set(itemKey, undefined);

        expect(layeredConfig.get(itemKey)).toEqual(baseItemValue);
      });
    });

    describe('when the option is set to treat `null` values as absent', () => {
      beforeEach(() => {
        layeredConfig = new LayeredConfigStore([baseLayerConfig, overridingLayerConfig], {
          valuesConsideredAbsent: [null]
        });
      });

      it('returns the first non-null mapped value from the uppermost overriding config layer when the `get` method is called with a key that is mapped in multiple underyling configs', () => {
        const itemKey = 'random_key';
        const baseItemValue = 'overridden base value';

        baseLayerConfig.set(itemKey, baseItemValue);
        overridingLayerConfig.set(itemKey, null);

        expect(layeredConfig.get(itemKey)).toEqual(baseItemValue);
      });
    });

    describe('when the option is set to treat empty string values as absent', () => {
      beforeEach(() => {
        layeredConfig = new LayeredConfigStore([baseLayerConfig, overridingLayerConfig], {
          valuesConsideredAbsent: ['']
        });
      });

      it('returns the first non-empty-string mapped value from the uppermost overriding config layer when the `get` method is called with a key that is mapped in multiple underyling configs', () => {
        const itemKey = 'random_key';
        const baseItemValue = 'overridden base value';

        baseLayerConfig.set(itemKey, baseItemValue);
        overridingLayerConfig.set(itemKey, '');

        expect(layeredConfig.get(itemKey)).toEqual(baseItemValue);
      });
    });

    describe('when the option is set to treat a specified object as absent', () => {
      const objectTreatedAsAbsent = { randomKey: 'randomValue' };

      beforeEach(() => {
        layeredConfig = new LayeredConfigStore([baseLayerConfig, overridingLayerConfig], {
          valuesConsideredAbsent: [objectTreatedAsAbsent]
        });
      });

      it('returns the first mapped value not set for treatment as absent, from the uppermost overriding config layer when the `get` method is called with a key that is mapped in multiple underyling configs', () => {
        const itemKey = 'random_key';
        const baseItemValue = 'overridden base value';

        baseLayerConfig.set(itemKey, baseItemValue);
        overridingLayerConfig.set(itemKey, objectTreatedAsAbsent);

        expect(layeredConfig.get(itemKey)).toEqual(baseItemValue);
      });
    });

    describe('when the base config layers are empty', () => {
      beforeEach(() => {
        baseLayerConfig.clear();
      });

      it('returns false when the `has` method is called with a key that is not in the overriding layer config', () => {
        expect(layeredConfig.has('random_unadded_absent_key')).toBe(false);
      });

      it('returns true when the `has` method is called with a key that maps to a non-undefined value in the overriding layer config', () => {
        const itemKey = 'random_key';
        const itemValue = 'value for random_key';

        overridingLayerConfig.set(itemKey, itemValue);
        expect(layeredConfig.has(itemKey)).toBe(true);
      });

      it('returns true when the `has` method is called with a key that maps to the `undefined` value in the overriding layer config', () => {
        const itemKey = 'random_key';

        overridingLayerConfig.set(itemKey, undefined);
        expect(layeredConfig.has(itemKey)).toBe(true);
      });

      it('returns true when the `has` method is called with a key that maps to the `null` value in the overriding layer config', () => {
        const itemKey = 'random_key';

        overridingLayerConfig.set(itemKey, null);
        expect(layeredConfig.has(itemKey)).toBe(true);
      });

      it('returns undefined when the `get` method is called with a key that is not in the overriding layer config', () => {
        expect(layeredConfig.get('random_unadded_absent_key')).toBeUndefined();
      });

      it('returns the corresponding value when the `get` method is called with the key with which the value is mapped in the overriding layer config', () => {
        const itemKey = 'random_key';
        const itemValue = 'value for random_key';

        overridingLayerConfig.set(itemKey, itemValue);
        expect(layeredConfig.get(itemKey)).toEqual(itemValue);
      });
    });

    describe('when the overriding config layers are empty', () => {
      beforeEach(() => {
        overridingLayerConfig.clear();
      });

      it('returns false when the `has` method is called with a key that is not in the base layer config', () => {
        expect(layeredConfig.has('random_unadded_absent_key')).toBe(false);
      });

      it('returns true when the `has` method is called with a key that maps to a non-undefined value in the base layer config', () => {
        const itemKey = 'random_key';
        const itemValue = 'value for random_key';

        baseLayerConfig.set(itemKey, itemValue);
        expect(layeredConfig.has(itemKey)).toBe(true);
      });

      it('returns true when the `has` method is called with a key that maps to the `undefined` value in the base layer config', () => {
        const itemKey = 'random_key';

        baseLayerConfig.set(itemKey, undefined);
        expect(layeredConfig.has(itemKey)).toBe(true);
      });

      it('returns true when the `has` method is called with a key that maps to the `null` value in the base layer config', () => {
        const itemKey = 'random_key';

        baseLayerConfig.set(itemKey, null);
        expect(layeredConfig.has(itemKey)).toBe(true);
      });

      it('returns undefined when the `get` method is called with a key that is not in the base layer config', () => {
        expect(layeredConfig.get('random_unadded_absent_key')).toBeUndefined();
      });

      it('returns the corresponding value when the `get` method is called with the key with which the value is mapped in the base layer config', () => {
        const itemKey = 'random_key';
        const itemValue = 'value for random_key';

        baseLayerConfig.set(itemKey, itemValue);
        expect(layeredConfig.get(itemKey)).toEqual(itemValue);
      });
    });
  });
});
