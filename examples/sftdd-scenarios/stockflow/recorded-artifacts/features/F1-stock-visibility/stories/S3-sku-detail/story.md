# S3-sku-detail

**As a** warehouse operator
**I want to** open a SKU detail view showing that SKU's stock across all
its locations, including its tracking code
**So that** I can see everywhere one SKU is held, with untracked detail
such as par level shown clearly rather than as a blank or a crash.

E2E (UI) story: the operator opens a SKU's detail screen and sees its
stock per location, its combined `inventory_code`, and par level shown
as "not tracked".

## Independence

Distinct from S2: S2 is one flat table of all records. This story is a
per-SKU view (a single SKU across its locations), showing the tracking
code and the untracked par level as an explicit "not tracked" state,
which S1 and S2 do not build.
