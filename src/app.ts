import { Bot } from 'botbuilder-core';
import { BotFrameworkAdapter } from 'botbuilder-services';
import { createServer } from 'restify';
import { tryInOrder, tryInScoreOrder, ifMatches, ifTrue, ifMessage, ifText, ifRegExp } from 'prague-botbuilder';

// Create server
let server = createServer();
server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`${server.name} listening to ${server.url}`);
});

// Create connector
const adapter = new BotFrameworkAdapter({ 
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});

server.post('/api/messages', adapter.listen() as any);

const router =
    ifMessage()
        .thenTry(
            tryInOrder(
                ifRegExp(/howdy|hi|hello/i).thenDo(c => c.reply(`Hello to you!`)),
                ifRegExp(/what time is it/).thenDo(c => c.reply(`It's showtime.`)),
                ifRegExp(/my name is (.*)/).thenDo((c, matches) => c.reply(`Nice to meet you, ${matches[1]}`)),
                ifRegExp(/match (.*)/)
                    .thenTry(matches =>
                        tryInScoreOrder(
                            ifTrue(c => /bi/i.test(matches[1]) && { value: true, score: 0.5 })
                                .thenDo(c => c.reply(`I matched "bi"`)),
                            ifTrue(c => /bill/i.test(matches[1]) && { value: true, score: .75 })
                                .thenDo(c => c.reply(`I matched "bill"`))
                        )
                    )
            )
            .defaultDo(c => c.reply("I will never understand you humans"))
        )
        .elseDo(c => c.reply("non-message activity"))

const bot = new Bot(adapter)
    // add other middleware here
    .onReceive(c => router.route(c).toPromise());
