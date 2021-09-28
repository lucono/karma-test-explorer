import { mock } from 'jest-mock-extended';
import { Disposable } from '../../../src/util/disposable/disposable';
import { Disposer } from '../../../src/util/disposable/disposer';

describe('Disposer', () => {
  describe('dispose static method', () => {
    it('invokes the dispose method of each disposable', () => {
      const disposable1 = mock<Disposable>();
      const disposable2 = mock<Disposable>();
      const disposables: Disposable[] = [disposable1, disposable2];

      Disposer.dispose(disposables);

      expect(disposable1.dispose).toHaveBeenCalledTimes(1);
      expect(disposable2.dispose).toHaveBeenCalledTimes(1);
    });

    it('calls dispose method of duplicated disposables only once', () => {
      const nonDuplicatedDisposable = mock<Disposable>();
      const duplicatedDisposable = mock<Disposable>();
      const disposables: Disposable[] = [nonDuplicatedDisposable, duplicatedDisposable, duplicatedDisposable];

      Disposer.dispose(disposables);

      expect(nonDuplicatedDisposable.dispose).toHaveBeenCalledTimes(1);
      expect(duplicatedDisposable.dispose).toHaveBeenCalledTimes(1);
    });

    it('clears the array of disposables', () => {
      const disposables: Disposable[] = [mock<Disposable>()];

      Disposer.dispose(disposables);
      expect(disposables).toHaveLength(0);
    });

    it('handles null values without exception', () => {
      const disposable1 = mock<Disposable>();
      const disposables = [undefined, disposable1, undefined];

      Disposer.dispose(disposables);

      expect(disposable1.dispose).toHaveBeenCalledTimes(1);
      expect(disposables).toHaveLength(0);
    });

    it('handles combination of Disposables and Disposable arrays', () => {
      const disposable1 = mock<Disposable>();
      const disposable2 = mock<Disposable>();
      const disposable2Array = [disposable2];

      Disposer.dispose(disposable1, disposable2Array);

      expect(disposable1.dispose).toHaveBeenCalledTimes(1);
      expect(disposable2.dispose).toHaveBeenCalledTimes(1);
      expect(disposable2Array).toHaveLength(0);
    });
  });
});
