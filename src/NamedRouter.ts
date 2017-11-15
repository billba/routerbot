import { Router } from 'prague-botbuilder';

export class NamedRouter <ARGS extends object> {
    private static registry: {
        [name: string]: (args: any) => Router;
    } = {}

    constructor(
        public name: string,
        getRouter: (args?: ARGS) => Router,
        redefine = false
    ) {
        if (NamedRouter.registry[name] && !redefine) {
            console.warn(`You tried to redefine a Named Router named ${name} without setting the "redefine" flag. This attempt was ignored.`);
            return;
        }

        NamedRouter.registry[name] = getRouter;
    }

    static getRouter(name: string, args: any) {
        const getRouter = NamedRouter.registry[name];
        return getRouter && getRouter(args);
    }
}