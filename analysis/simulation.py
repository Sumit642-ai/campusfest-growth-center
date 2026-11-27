import numpy as np
rng=np.random.default_rng(7); N=20000; avg=93000
def run(bets=True):
    pb=lambda p: (rng.random(N)<p)&bets
    tot=np.zeros(N)
    b1=pb(.7); d=rng.binomial(24,np.where(b1,.65,.5)); tot+=d*avg*np.where(b1,1.2,1.05)*rng.normal(1,.15,N)
    b2=pb(.6); d=rng.binomial(np.where(b2,45,30),.55); tot+=d*avg*rng.normal(1,.15,N)
    b3=pb(.4); tot+=rng.binomial(26,np.where(b3,.2,0))*70000
    b4=pb(.35); tot+=np.where(b4,rng.binomial(6,.67,N)*150000,0)
    b5=pb(.45); tot+=np.where(b5,rng.binomial(3,.9,N)*148000-50000,0)  # category auction: premium over the new tier in 3 categories, minus ₹50k lost from brands turned away
    cash=tot*np.where(bets,.92,.89)*rng.uniform(.8,.95,N)
    return [np.percentile(tot,p)/1e5 for p in (10,50,90)],[np.percentile(cash,p)/1e5 for p in (10,50,90)]
print(run(False)); print(run(True))
