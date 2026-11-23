package barkeep

import (
	"chain"
	"strings"
	"testing"

	"gno.land/p/g1dmwvymew9ku97tp30xka70w4tnn8cydh2tct9p/renown/v0"
	"gno.land/p/nt/markdown/sanitize/v0"
)

func newTestSource(id int, tier string) *source {
	s := &source{
		id:       id,
		path:     "gno.land/r/test/s" + itoa(int64(id)),
		category: renown.Contribution,
		tier:     tier,
		capacity: params.DefaultCap,
	}
	if tier == TierVerified {
		s.weight = params.DefaultWeight
	}
	sourceIDs.Set(s.path, id)
	sourcesByID.Set(idKey(id), s)
	return s
}

func TestJSONString(t *testing.T) {
	cases := []struct{ in, want string }{
		{"plain", `"plain"`},
		{`a"b\c`, `"a\"b\\c"`},
		{"line\nbreak\t", "\"line\\nbreak\\u0009\""},
		{"<b>&", "\"\\u003cb\\u003e\\u0026\""},
		{"héllo", `"héllo"`},
		{"bad\xffbyte", "\"bad\\ufffdbyte\""},
		{"cut\xc3", "\"cut\\ufffd\""},
		{"ls ps ", "\"ls\\u2028ps\\u2029\""},
		{"del\x7f", "\"del\\u007f\""},
	}
	for _, c := range cases {
		if got := jsonStr(c.in); got != c.want {
			t.Errorf("jsonStr(%q) = %s, want %s", c.in, got, c.want)
		}
	}
	if got := jsonObj("a", "1", "b", jsonStr("x")); got != `{"a":1,"b":"x"}` {
		t.Errorf("jsonObj = %s", got)
	}
}

func TestHelpers(t *testing.T) {
	if milliStr(1234) != "1.234" || milliStr(5) != "0.005" || milliStr(-1500) != "-1.500" {
		t.Errorf("milliStr: %s %s %s", milliStr(1234), milliStr(5), milliStr(-1500))
	}
	if idKey(42) != "00000042" {
		t.Errorf("idKey = %s", idKey(42))
	}
	pages := []struct {
		q    string
		want int
	}{{"", 1}, {"page=3", 3}, {"x=1&page=2", 2}, {"page=-1", 1}, {"page=abc", 1}, {"page=99999999", 1}}
	for _, c := range pages {
		if got := pageParam(c.q); got != c.want {
			t.Errorf("pageParam(%q) = %d, want %d", c.q, got, c.want)
		}
	}
	s, e := page(10, 8, 5)
	if s != 8 || e != 10 {
		t.Errorf("page = %d,%d", s, e)
	}
	s, e = page(10, -3, 0)
	if s != 0 || e != 10 {
		t.Errorf("page default = %d,%d", s, e)
	}
}

func TestBucketEviction(t *testing.T) {
	now := int64(1000)
	p := &profile{}
	for i := 1; i <= MaxBuckets; i++ {
		s := newTestSource(1000+i, TierVerified)
		if !p.accrue(s, int64(i)*renown.Milli, now) {
			t.Fatalf("accrue %d failed", i)
		}
	}
	if len(p.buckets) != MaxBuckets {
		t.Fatalf("buckets = %d", len(p.buckets))
	}
	// An unverified source cannot evict verified history.
	spam := newTestSource(2001, TierUnverified)
	if p.accrue(spam, 50*renown.Milli, now) {
		t.Fatal("unverified source evicted a verified bucket")
	}
	// A larger verified bucket replaces the smallest one (source 1001, 1 point).
	big := newTestSource(2002, TierVerified)
	if !p.accrue(big, 50*renown.Milli, now) {
		t.Fatal("larger verified bucket was not stored")
	}
	for _, bk := range p.buckets {
		if bk.src == 1001 {
			t.Fatal("smallest bucket was not evicted")
		}
	}
	if len(p.buckets) != MaxBuckets {
		t.Fatalf("buckets after eviction = %d", len(p.buckets))
	}
}

func TestRecentRing(t *testing.T) {
	p := &profile{}
	for i := 0; i < MaxRecent+5; i++ {
		p.pushRecent(recentEntry{units: int64(i)})
	}
	if len(p.recent) != MaxRecent || p.recent[0].units != 5 || p.recent[MaxRecent-1].units != MaxRecent+4 {
		t.Fatalf("recent ring: len=%d first=%d last=%d", len(p.recent), p.recent[0].units, p.recent[len(p.recent)-1].units)
	}
}

func testAddr(name string) address {
	return chain.PackageAddress("gno.land/r/test/user/" + name)
}

func inTop(addr address) bool {
	for _, e := range top {
		if e.addr == addr {
			return true
		}
	}
	return false
}

// putProfile stores a profile holding points milli-points from s at ts.
func putProfile(addr address, s *source, points, ts int64) *profile {
	p := &profile{firstSeen: ts, buckets: []bucket{{src: s.id, b: renown.Bucket{Points: points, LastTs: ts}}}}
	profiles.Set(addr.String(), p)
	return p
}

func TestTopMaintenance(t *testing.T) {
	saved, cursor := top, topCursor
	defer func() { top, topCursor = saved, cursor }()
	top, topCursor = nil, 0
	const ts = 1000
	for i := 1; i <= MaxTop; i++ {
		updateTop(testAddr("a"+itoa(int64(i))), int64(i)*renown.Milli, ts)
	}
	updateTop(testAddr("zero"), 0, ts)
	if len(top) != MaxTop || inTop(testAddr("zero")) {
		t.Fatalf("top size = %d, zero inserted = %v", len(top), inTop(testAddr("zero")))
	}
	// The entries have no profile, so their live score is 0: the re-scored
	// candidate loses its slot to a 1 milli-point newcomer at once, and the
	// rolling refresh advanced by TopRefreshBatch.
	updateTop(testAddr("low"), 1, ts)
	if !inTop(testAddr("low")) || len(top) != MaxTop || topCursor != TopRefreshBatch {
		t.Fatalf("stale snapshot kept a newcomer out (cursor %d)", topCursor)
	}
	updateTop(testAddr("low"), 7, ts)
	for _, e := range top {
		if e.addr == testAddr("low") && e.snap != 7 {
			t.Fatal("existing entry not updated")
		}
	}
}

func TestTopRevokedEviction(t *testing.T) {
	saved, cursor := top, topCursor
	defer func() { top, topCursor = saved, cursor }()
	top, topCursor = nil, 0
	const ts = 1000
	good := newTestSource(3001, TierVerified)
	bad := newTestSource(3002, TierVerified)
	var addrs []address
	for i := 1; i < MaxTop; i++ {
		a := testAddr("g" + itoa(int64(i)))
		p := putProfile(a, good, 10*renown.Milli, ts)
		updateTop(a, computeScore(a, p, ts).total, ts)
		addrs = append(addrs, a)
	}
	whale := testAddr("whale")
	p := putProfile(whale, bad, 100*renown.Milli, ts)
	updateTop(whale, computeScore(whale, p, ts).total, ts)
	addrs = append(addrs, whale)
	// After a revoke the whale's snapshot is stale-high. The rolling
	// refresh reaches it within MaxTop/TopRefreshBatch newcomers, and no
	// verified member (fresh score above the newcomer) is evicted meanwhile.
	bad.tier = TierRevoked
	newcomer := testAddr("newcomer")
	calls := 0
	for ; calls < MaxTop/TopRefreshBatch+1 && !inTop(newcomer); calls++ {
		updateTop(newcomer, renown.Milli, ts)
	}
	if inTop(whale) || !inTop(newcomer) {
		t.Fatalf("revoked whale kept its slot after %d calls: whale=%v newcomer=%v", calls, inTop(whale), inTop(newcomer))
	}
	for _, a := range addrs[:len(addrs)-1] {
		if !inTop(a) {
			t.Fatalf("verified member %s evicted", a)
		}
	}
	for _, a := range addrs {
		profiles.Remove(a.String())
	}
}

// fillTop puts MaxTop real profiles (10 points each from a verified source)
// on an empty board and returns their addresses and shared fresh score.
func fillTop(t *testing.T, prefix string, srcID int, ts int64) ([]address, int64) {
	src := newTestSource(srcID, TierVerified)
	var addrs []address
	var fresh int64
	for i := 0; i < MaxTop; i++ {
		a := testAddr(prefix + itoa(int64(i)))
		p := putProfile(a, src, 10*renown.Milli, ts)
		fresh = computeScore(a, p, ts).total
		updateTop(a, fresh, ts)
		addrs = append(addrs, a)
	}
	if len(top) != MaxTop || fresh <= 2 {
		t.Fatalf("fillTop: size %d fresh %d", len(top), fresh)
	}
	return addrs, fresh
}

func TestTopLowSnapshotKeepsSlot(t *testing.T) {
	saved, cursor := top, topCursor
	defer func() { top, topCursor = saved, cursor }()
	top, topCursor = nil, 0
	const ts = 1000
	addrs, fresh := fillTop(t, "lo", 3501, ts)
	defer func() {
		for _, a := range addrs {
			profiles.Remove(a.String())
		}
	}()
	// Member 10 (outside the first rolling batch) has a snapshot far below
	// its fresh score, e.g. it registered a name since its last attestation.
	const victim = 10
	top[victim].snap = 1
	newcomer := testAddr("lo-newcomer")
	updateTop(newcomer, fresh-1, ts)
	if !inTop(addrs[victim]) {
		t.Fatal("member with a too-low snapshot was evicted")
	}
	if inTop(newcomer) {
		t.Fatal("newcomer below every fresh score took a slot")
	}
	if top[victim].snap != fresh {
		t.Fatalf("victim snapshot not re-scored: %d, want %d", top[victim].snap, fresh)
	}
	// A newcomer above the fresh scores still gets in.
	updateTop(newcomer, fresh+1, ts)
	if !inTop(newcomer) || len(top) != MaxTop {
		t.Fatalf("higher newcomer rejected (size %d)", len(top))
	}
}

func TestTopCursorWraps(t *testing.T) {
	saved, cursor := top, topCursor
	defer func() { top, topCursor = saved, cursor }()
	top, topCursor = nil, 0
	const ts = 1000
	addrs, fresh := fillTop(t, "wr", 3601, ts)
	defer func() {
		for _, a := range addrs {
			profiles.Remove(a.String())
		}
	}()
	// Stale-high snapshots everywhere; a 1 milli-point newcomer never
	// competes, so each call only advances the rolling refresh.
	for i := range top {
		top[i].snap = fresh + 999
	}
	rounds := MaxTop / TopRefreshBatch
	for i := 0; i < rounds; i++ {
		updateTop(testAddr("wr-newcomer"), 1, ts)
	}
	for i, e := range top {
		if e.snap != fresh {
			t.Fatalf("entry %d not refreshed after %d calls: %d", i, rounds, e.snap)
		}
	}
	// The next call wraps the cursor back to the start of the board.
	top[0].snap = fresh + 999
	updateTop(testAddr("wr-newcomer"), 1, ts)
	if top[0].snap != fresh || topCursor != TopRefreshBatch {
		t.Fatalf("cursor did not wrap: snap %d cursor %d", top[0].snap, topCursor)
	}
	if inTop(testAddr("wr-newcomer")) {
		t.Fatal("low newcomer took a slot")
	}
}

func TestCapLoweredAfterFill(t *testing.T) {
	s := newTestSource(3101, TierVerified)
	a := testAddr("capped")
	ts := now()
	p := putProfile(a, s, 100*renown.Milli, ts)
	defer profiles.Remove(a.String())
	if got := SourceScoreOf(a, s.path); got != 100 {
		t.Fatalf("full bucket = %d", got)
	}
	s.capacity = 40 * renown.Milli
	if got := SourceScoreOf(a, s.path); got != 40 {
		t.Fatalf("lowered cap not applied on read: %d", got)
	}
	if got := CategoryScoreOf(a, renown.Contribution); got != 40 {
		t.Fatalf("category after lowered cap = %d", got)
	}
	p.accrue(s, 10*renown.Milli, ts)
	if p.buckets[0].b.Points != 40*renown.Milli {
		t.Fatalf("accrue above lowered cap = %d", p.buckets[0].b.Points)
	}
}

func TestBucketEvictionWeighted(t *testing.T) {
	ts := int64(1000)
	p := &profile{}
	for i := 1; i <= MaxBuckets; i++ {
		p.accrue(newTestSource(3200+i, TierVerified), 10*renown.Milli, ts)
	}
	// 5 points at weight x3 (15 weighted) outrank 10 points at x1.
	heavy := newTestSource(3300, TierVerified)
	heavy.weight = params.MaxWeight
	if !p.accrue(heavy, 5*renown.Milli, ts) {
		t.Fatal("heavier weighted bucket was not stored")
	}
	light := newTestSource(3301, TierVerified)
	light.weight = 100
	if p.accrue(light, 50*renown.Milli, ts) {
		t.Fatal("5 weighted points evicted a 10-point bucket")
	}
}

func TestRenderProfileWithData(t *testing.T) {
	s := newTestSource(3401, TierVerified)
	a := testAddr("rendered")
	p := putProfile(a, s, 42*renown.Milli, now())
	p.pushRecent(recentEntry{src: s.id, kind: "quest.completed", units: 42, ts: now()})
	p.attestations = 1
	defer profiles.Remove(a.String())
	out := Render("u/" + a.String())
	for _, want := range []string{"## By source", sanitize.TableCell(s.path), "42.000", "## Recent", sanitize.TableCell("quest.completed")} {
		if !strings.Contains(out, want) {
			t.Errorf("profile render misses %q:\n%s", want, out)
		}
	}
	if !strings.Contains(ProfileJSON(a), `"attestations":1`) {
		t.Error(ProfileJSON(a))
	}
}

func TestValidDesc(t *testing.T) {
	cases := []struct {
		in string
		ok bool
	}{
		{"", true},
		{"Quests for adventurers: 1 point each!", true},
		{strings.Repeat("a", MaxDescLen), true},
		{strings.Repeat("a", MaxDescLen+1), false},
		{"see [x](javascript:y)", false},
		{"<script>", false},
		{"`code`", false},
		{"line\nbreak", false},
		{"tab\there", false},
		{"héllo", false},
		{"del\x7f", false},
		{"a | b", false},
		{"# heading", false},
		{"*bold*", false},
		{"_em_", false},
		{"&lt;", false},
		{"see https://evil.example", false},
		{"see WWW.evil.example", false},
		{"ftp://x", false},
		{"Quests, votes: 1-10 points. Ok?", true},
	}
	for _, c := range cases {
		if got := ValidDesc(c.in); got != c.ok {
			t.Errorf("ValidDesc(%q) = %v, want %v", c.in, got, c.ok)
		}
	}
}

func TestRegisterSourceRules(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(testAddr("someone")))
	if RegisterSource(cross(cur), renown.Building, "user") {
		t.Error("a user registered as a source")
	}
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/test/reg"))
	for _, bad := range []struct{ cat, desc string }{
		{"balance", "ok"},
		{"", "ok"},
		{renown.Building, strings.Repeat("d", MaxDescLen+1)},
		{renown.Building, "[click](javascript:x)"},
		{renown.Building, "multi\nline"},
	} {
		if RegisterSource(cross(cur), bad.cat, bad.desc) {
			t.Errorf("registered with category %q desc %q", bad.cat, bad.desc)
		}
	}
	if !RegisterSource(cross(cur), renown.Building, "Builders guild") {
		t.Fatal("valid registration failed")
	}
	if RegisterSource(cross(cur), renown.Building, "again") {
		t.Error("duplicate registration accepted")
	}
	if SourceTier("gno.land/r/test/reg") != TierUnverified {
		t.Error("new source is not unverified")
	}
}

func TestAttestRules(cur realm, t *testing.T) {
	const path = "gno.land/r/test/att"
	bob, carol := testAddr("bob"), testAddr("carol")
	testing.SetRealm(testing.NewCodeRealm(path))
	if !RegisterSource(cross(cur), renown.Community, "attest rules") {
		t.Fatal("register failed")
	}
	// Unverified sources cannot create profiles.
	if Attest(cross(cur), bob, "x", 1) || profileOf(bob) != nil {
		t.Fatal("unverified source created a profile")
	}

	before := verifiedCount
	testing.SetRealm(testing.NewUserRealm(admin))
	SetSourceTier(cross(cur), path, TierVerified)
	SetSourceTier(cross(cur), path, TierVerified) // idempotent
	if verifiedCount != before+1 {
		t.Fatalf("verifiedCount = %d, want %d", verifiedCount, before+1)
	}

	testing.SetRealm(testing.NewCodeRealm(path))
	rejects := []struct {
		subject address
		kind    string
		units   int64
	}{
		{bob, "x", 0},
		{bob, "x", -5},
		{bob, "x", params.MaxUnitsPerAttest + 1},
		{bob, "Bad Kind", 1},
		{bob, "", 1},
		{bob, strings.Repeat("k", renown.MaxKindLen+1), 1},
		{chain.PackageAddress(path), "x", 1}, // the source itself
		{address("g1notanaddress"), "x", 1},
	}
	for _, r := range rejects {
		if Attest(cross(cur), r.subject, r.kind, r.units) {
			t.Errorf("Attest(%s, %q, %d) accepted", r.subject, r.kind, r.units)
		}
	}
	if profileOf(bob) != nil {
		t.Fatal("rejected attestations created a profile")
	}
	if !Attest(cross(cur), bob, "x", params.MaxUnitsPerAttest) || SourceScoreOf(bob, path) != params.MaxUnitsPerAttest {
		t.Fatal("valid attestation not recorded")
	}

	// Back to unverified: existing profiles still record, new ones do not.
	testing.SetRealm(testing.NewUserRealm(admin))
	SetSourceTier(cross(cur), path, TierUnverified)
	if verifiedCount != before {
		t.Fatalf("verifiedCount after unverify = %d", verifiedCount)
	}
	testing.SetRealm(testing.NewCodeRealm(path))
	if !Attest(cross(cur), bob, "x", 1) {
		t.Error("unverified source could not record on an existing profile")
	}
	if Attest(cross(cur), carol, "x", 1) || profileOf(carol) != nil {
		t.Error("unverified source created a profile")
	}
	if ScoreOf(bob) != 0 {
		t.Errorf("unverified points counted: %d", ScoreOf(bob))
	}
}

func TestAdminTwoStep(cur realm, t *testing.T) {
	orig, next, mallory := admin, testAddr("next-admin"), testAddr("mallory")

	testing.SetRealm(testing.NewUserRealm(mallory))
	if revive(func() { TransferAdmin(cross(cur), mallory) }) == nil {
		t.Fatal("non-admin proposed an admin")
	}
	testing.SetRealm(testing.NewUserRealm(orig))
	if revive(func() { TransferAdmin(cross(cur), address("g1bad")) }) == nil {
		t.Fatal("invalid admin address accepted")
	}
	TransferAdmin(cross(cur), next)
	if PendingAdmin() != next || Admin() != orig {
		t.Fatal("proposal changed the admin early")
	}
	testing.SetRealm(testing.NewUserRealm(mallory))
	if revive(func() { AcceptAdmin(cross(cur)) }) == nil {
		t.Fatal("wrong address accepted the admin role")
	}
	testing.SetRealm(testing.NewUserRealm(orig))
	if revive(func() { AcceptAdmin(cross(cur)) }) == nil {
		t.Fatal("current admin accepted its own proposal")
	}
	testing.SetRealm(testing.NewUserRealm(next))
	AcceptAdmin(cross(cur))
	if Admin() != next || PendingAdmin() != "" {
		t.Fatalf("admin = %s pending = %s", Admin(), PendingAdmin())
	}
	testing.SetRealm(testing.NewUserRealm(orig))
	if revive(func() { PauseAll(cross(cur), true) }) == nil {
		t.Fatal("old admin still has power")
	}

	// Cancel a proposal, then hand the role back.
	testing.SetRealm(testing.NewUserRealm(next))
	TransferAdmin(cross(cur), mallory)
	TransferAdmin(cross(cur), "")
	testing.SetRealm(testing.NewUserRealm(mallory))
	if revive(func() { AcceptAdmin(cross(cur)) }) == nil {
		t.Fatal("cancelled proposal was accepted")
	}
	testing.SetRealm(testing.NewUserRealm(next))
	TransferAdmin(cross(cur), orig)
	testing.SetRealm(testing.NewUserRealm(orig))
	AcceptAdmin(cross(cur))
	if Admin() != orig {
		t.Fatal("admin not restored")
	}
}

func TestSetWeightBounds(cur realm, t *testing.T) {
	const path = "gno.land/r/test/weight"
	testing.SetRealm(testing.NewCodeRealm(path))
	RegisterSource(cross(cur), renown.DeFi, "weights")

	testing.SetRealm(testing.NewUserRealm(testAddr("mallory")))
	if revive(func() { SetWeight(cross(cur), path, 1000, 10) }) == nil {
		t.Error("non-admin set a weight")
	}
	testing.SetRealm(testing.NewUserRealm(admin))
	for _, c := range []struct{ w, cap int64 }{
		{-1, 10}, {params.MaxWeight + 1, 10}, {1000, 0}, {1000, -1}, {1000, 1_000_001},
	} {
		if revive(func() { SetWeight(cross(cur), path, c.w, c.cap) }) == nil {
			t.Errorf("SetWeight(%d, %d) accepted", c.w, c.cap)
		}
	}
	if revive(func() { SetWeight(cross(cur), "gno.land/r/test/none", 1000, 10) }) == nil {
		t.Error("unknown source accepted")
	}
	SetWeight(cross(cur), path, params.MaxWeight, 1_000_000)
	SetWeight(cross(cur), path, 0, 1)
	s := sourceByPath(path)
	if s.weight != 0 || s.capacity != renown.Milli {
		t.Errorf("weight = %d cap = %d", s.weight, s.capacity)
	}
}

func TestRenderSafe(t *testing.T) {
	out := Render("u/<script>alert(1)</script>")
	if strings.Contains(out, "<script>") || !strings.Contains(out, "not a valid address") {
		t.Errorf("profile render leaked input: %s", out)
	}
	if !strings.Contains(Render("nope](javascript:x)"), "# Not found") {
		t.Error("unknown route")
	}
	for _, r := range []string{"", "sources", "algorithm", "integrate", "?page=2", "sources?page=9"} {
		if Render(r) == "" {
			t.Errorf("empty render for %q", r)
		}
	}
}

func TestReadsOnUnknown(t *testing.T) {
	stranger := address("g1wymu47drhr0kuq2098m792lytgtj2nyx77yrsm")
	if ScoreOf(stranger) != 0 || TierOf(stranger) != renown.Stranger || HasMinScore(stranger, 1) {
		t.Error("stranger should have no score")
	}
	if CategoryScoreOf(stranger, "balance") != 0 || SourceScoreOf(stranger, "gno.land/r/none") != 0 {
		t.Error("unknown category or source should be 0")
	}
	if !strings.Contains(ProfileJSON(stranger), `"score":0`) {
		t.Error(ProfileJSON(stranger))
	}
	if !strings.Contains(ParamsJSON(), `"halfLifeSeconds":2592000`) {
		t.Error(ParamsJSON())
	}
}
