import * as fc from 'fast-check';

describe('Property-Based Testing Examples', () => {
  describe('String operations', () => {
    it('concatenation is associative', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), fc.string(), (a, b, c) => {
          return a + b + c === a + (b + c);
        })
      );
    });

    it('reversing a string twice returns the original', () => {
      fc.assert(
        fc.property(fc.string(), (str) => {
          const reversed = str.split('').reverse().join('');
          const doubleReversed = reversed.split('').reverse().join('');
          return doubleReversed === str;
        })
      );
    });
  });

  describe('Array operations', () => {
    it('array length is preserved after map', () => {
      fc.assert(
        fc.property(fc.array(fc.integer()), (arr) => {
          const mapped = arr.map((x) => x * 2);
          return mapped.length === arr.length;
        })
      );
    });

    it('filtering then mapping equals mapping then filtering', () => {
      fc.assert(
        fc.property(fc.array(fc.integer()), (arr) => {
          const filterFn = (x: number) => x > 0;
          const mapFn = (x: number) => x * 2;

          const filterThenMap = arr.filter(filterFn).map(mapFn);
          const mapThenFilter = arr.map(mapFn).filter((x) => filterFn(x / 2));

          return JSON.stringify(filterThenMap) === JSON.stringify(mapThenFilter);
        })
      );
    });
  });

  describe('Number operations', () => {
    it('addition is commutative', () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer(), (a, b) => {
          return a + b === b + a;
        })
      );
    });

    it('multiplication by zero always returns zero', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          return n * 0 === 0;
        })
      );
    });
  });
});
