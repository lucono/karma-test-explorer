export class UtilityHelper {
  public constructor() {}

  public removeElementsFromArrayWithoutModifyingIt(elements?: any[], elementsToRemove?: any[] | any) {
    if (elements === undefined) {
      return [];
    }

    if (Array.isArray(elementsToRemove)) {
      return elements.filter(element => {
        if (typeof element === "object") {
          const key = Object.keys(element)[0];
          return !elementsToRemove.some(x => key in x);
        }

        return elementsToRemove.indexOf(element) < 0;
      });
    } else {
      return elements.filter(element => {
        return elementsToRemove !== element;
      });
    }
  }
}
