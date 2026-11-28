export const LESSON_IDS=["battlefield","placement","influence","abilities","evolution","scoring","decks","next-steps"] as const;
export type LessonId=typeof LESSON_IDS[number];
export const LEARNING_DESTINATIONS=["collection","play","progression","decks","shop","trading","customization"] as const;
export type LearningDestination=typeof LEARNING_DESTINATIONS[number];
export type LearningProgress={schema:1;lesson:LessonId;completed:LessonId[];visited:LearningDestination[];dismissed:boolean};
export const DEFAULT_LEARNING:LearningProgress={schema:1,lesson:"battlefield",completed:[],visited:[],dismissed:false};
export const KINDRED_GUIDES:Record<string,{summary:string;tip:string;cards:string[]}>= {
 Nature:{summary:"Grow a connected territory with adaptable creatures and evolving lines.",tip:"Begin with accessible creatures, then keep useful predecessors alive for evolution.",cards:["n003","n004"]},
 Mythical:{summary:"Develop powerful creatures and turn surviving formations into strong rows.",tip:"Build the placement sites and predecessors your larger creatures require.",cards:["m001","m002"]},
 Arcane:{summary:"Combine support, auras and carefully positioned effects.",tip:"Read each pattern and condition; a strong support card needs the right neighbours.",cards:["a001","a002"]},
 Undead:{summary:"Use death, return and replacement effects to maintain a resilient formation.",tip:"Inspect resurrection and activation limits; returning creatures still obey their card rules.",cards:["u001","u002"]},
 Constructs:{summary:"Build fortified positions with mechanical support and protection.",tip:"Protect key sites while continuing to open forward placement opportunities.",cards:["c001","c002"]}
};
