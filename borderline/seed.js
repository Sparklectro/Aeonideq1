// deterministic Math.random for before/after comparison
let s=12345;Math.random=()=>{s=(s+0x6D2B79F5)|0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
