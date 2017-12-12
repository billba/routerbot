import { NamedRouter } from './NamedRouter';
import { ifMatches } from 'prague-botbuilder';

export { NamedRouter }

interface NamedRouterState<ARGS> {
    name: string,
    args?: ARGS
}

declare global {
    interface ConversationState {
        promptState: NamedRouterState<any>;
    }
}

export const tryActiveRouter = () => ifMatches(c => c.state.conversation.promptState
        ? { value: c.state.conversation.promptState }
        : { reason: 'noPromptState'}
    )
    .thenTry((c, promptState) => NamedRouter.getRouter(promptState.name, promptState.args))
    .beforeDo(c => c.clearActiveRouter());

import { Activity, Middleware } from 'botbuilder-core';

declare global {
    interface BotContext {
        setActiveRouter <ARGS extends object> (namedRouter: NamedRouter<ARGS>, args?: ARGS);
        clearActiveRouter ();
    }
}

export class ActiveRouter implements Middleware {
    contextCreated(context: BotContext) {
        context.setActiveRouter = (namedRouter: NamedRouter<any>, args = {} as any) => {
            context.state.conversation.promptState = { name: namedRouter.name, args }
        }

        context.clearActiveRouter = () => {
            delete context.state.conversation.promptState;
        }
    }
}