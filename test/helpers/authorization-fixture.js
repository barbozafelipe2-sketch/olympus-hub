import { createBudget } from '../../api/lib/budget.js';
export const admissionPolicy = () => ({maxLevel:4,allowedTiers:['economy','premium'],allowImage:true,allowWeb:true});
export const fixtureBudget = options => createBudget({...options,authorizeAttempt:async()=>{}});
