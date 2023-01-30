import Bluebird from 'bluebird';

import { DeferredPromise } from '../../../src/util/future/deferred-promise.js';

describe('DeferredPromise', () => {
  let deferredPromise: DeferredPromise<any>;
  let underlyingPromise: Bluebird<any>;

  beforeEach(() => {
    deferredPromise = new DeferredPromise();
    underlyingPromise = deferredPromise.promise();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initially holds an unresolved promise', () => {
    expect(underlyingPromise.isResolved()).toBe(false);
    expect(underlyingPromise.isFulfilled()).toBe(false);
    expect(underlyingPromise.isRejected()).toBe(false);
  });

  describe('fulfull method', () => {
    it('fulfills the corresponding promise with the specified value', async () => {
      expect.assertions(1);
      const expectedResolutionResult = 'fulfilled';
      deferredPromise.fulfill(expectedResolutionResult);

      await expect(underlyingPromise).resolves.toBe(expectedResolutionResult);
    });
  });

  describe('autoFulfull method', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('fulfills the underlying promise after the specified amount of time', () => {
      jest.useFakeTimers();
      const expectedResolutionResult = 'fulfilled';
      deferredPromise.autoFulfill(100, expectedResolutionResult);
      expect(underlyingPromise.isFulfilled()).toBe(false);

      jest.advanceTimersByTime(100);
      expect(underlyingPromise.isFulfilled()).toBe(true);
      expect(underlyingPromise.value()).toBe(expectedResolutionResult);
    });

    it('does not fulfill the underlying promise before the specified amount of time', () => {
      jest.useFakeTimers();
      const expectedResolutionResult = 'fulfilled';
      deferredPromise.autoFulfill(100, expectedResolutionResult);

      jest.advanceTimersByTime(99);
      expect(underlyingPromise.isFulfilled()).toBe(false);
    });
  });

  describe('reject method', () => {
    it('rejects the corresponding promise with the specified reason', async () => {
      expect.assertions(1);
      const expectedRejectionReason = 'rejected';
      deferredPromise.reject(expectedRejectionReason);

      await expect(underlyingPromise).rejects.toBe(expectedRejectionReason);
    });
  });

  describe('autoReject method', () => {
    it('rejects the underlying promise after the specified amount of time', () => {
      jest.useFakeTimers();
      const expectedRejectionReason = 'rejected';
      deferredPromise.autoReject(100, expectedRejectionReason);
      expect(underlyingPromise.isRejected()).toBe(false);

      jest.advanceTimersByTime(100);
      expect(underlyingPromise.isRejected()).toBe(true);
      expect(underlyingPromise.reason()).toBe(expectedRejectionReason);
    });

    it('does not reject the underlying promise before the specified amount of time', () => {
      jest.useFakeTimers();
      const expectedRejectionReason = 'rejected';
      deferredPromise.autoReject(100, expectedRejectionReason);

      jest.advanceTimersByTime(99);
      expect(underlyingPromise.isRejected()).toBe(false);
    });
  });

  describe('when fulfilled', () => {
    let resolutionValue: any;

    beforeEach(async () => {
      resolutionValue = 'fulfilled';
      deferredPromise.fulfill(resolutionValue);
      await underlyingPromise;
    });

    it('the resolution state is not altered by subsequent calls to the reject method', async () => {
      expect.assertions(1);
      deferredPromise.reject('rejected');

      await expect(underlyingPromise).resolves.toBe(resolutionValue);
    });

    it('the resolution state is not altered by subsequent elapsed auto-rejection', () => {
      jest.useFakeTimers();
      deferredPromise.autoReject(100, 'rejected');

      jest.advanceTimersByTime(100);
      expect(underlyingPromise.isRejected()).toBe(false);
      expect(underlyingPromise.isFulfilled()).toBe(true);
    });
  });

  describe('when rejected', () => {
    let rejectionReason: any;

    beforeEach(async () => {
      rejectionReason = 'rejected';
      deferredPromise.reject(rejectionReason);

      try {
        await underlyingPromise;
      } catch (error) {}
    });

    it('the resolution state is not altered by subsequent fulfill operations', async () => {
      expect.assertions(1);
      deferredPromise.fulfill('fulfilled');

      await expect(underlyingPromise).rejects.toBe(rejectionReason);
    });

    it('the resolution state is not altered by subsequent elapsed auto-fulfullment', () => {
      jest.useFakeTimers();
      deferredPromise.autoFulfill(100, 'fulfilled');

      jest.advanceTimersByTime(100);
      expect(underlyingPromise.isFulfilled()).toBe(false);
      expect(underlyingPromise.isRejected()).toBe(true);
    });
  });
});
