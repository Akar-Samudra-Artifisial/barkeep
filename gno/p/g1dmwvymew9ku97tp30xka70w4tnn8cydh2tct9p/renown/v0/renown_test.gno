package renown

import "testing"

func TestCategories(t *testing.T) {
	for i, c := range Categories() {
		if CategoryIndex(c) != i || !ValidCategory(c) {
			t.Errorf("category %q: index %d, want %d", c, CategoryIndex(c), i)
		}
	}
	for _, c := range []string{"", "balance", "Governance", "defi "} {
		if ValidCategory(c) || CategoryIndex(c) != -1 {
			t.Errorf("category %q should be invalid", c)
		}
	}
}

func TestValidKind(t *testing.T) {
	cases := []struct {
		kind string
		want bool
	}{
		{"quest.completed", true},
		{"vote_cast-2", true},
		{"", false},
		{"Quest", false},
		{"a b", false},
		{"<script>", false},
		{"[x](y)", false},
		{"abcdefghijklmnopqrstuvwxyz012345", true},
		{"abcdefghijklmnopqrstuvwxyz0123456", false},
	}
	for _, c := range cases {
		if got := ValidKind(c.kind); got != c.want {
			t.Errorf("ValidKind(%q) = %v, want %v", c.kind, got, c.want)
		}
	}
}

func TestSaturatingMath(t *testing.T) {
	cases := []struct {
		name      string
		got, want int64
	}{
		{"add", SatAdd(2, 3), 5},
		{"add overflow", SatAdd(maxInt64, 1), maxInt64},
		{"add underflow", SatAdd(minInt64, -1), minInt64},
		{"mul", SatMul(-4, 5), -20},
		{"mul overflow", SatMul(maxInt64/2+1, 2), maxInt64},
		{"mul neg overflow", SatMul(maxInt64, -2), minInt64},
		{"mul min", SatMul(minInt64, -1), maxInt64},
		{"muldiv", MulDiv(7, 3, 2), 10},
		{"muldiv big", MulDiv(maxInt64, 1000, 1000), maxInt64},
		{"muldiv no overflow", MulDiv(maxInt64/10, 5, 10), maxInt64 / 20},
		{"muldiv saturates", MulDiv(maxInt64, 3000, 1000), maxInt64},
		{"muldiv invalid den", MulDiv(5, 5, 0), 0},
		{"muldiv negative", MulDiv(-5, 5, 1), 0},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("%s: got %d, want %d", c.name, c.got, c.want)
		}
	}
}

func TestDecayTable(t *testing.T) {
	const hl = 8000
	cases := []struct {
		points, dt, want int64
	}{
		{1_000_000, 0, 1_000_000},
		{1_000_000, -5, 1_000_000},
		{1_000_000, 999, 1_000_000}, // below one eighth
		{1_000_000, 1000, 917_004},
		{1_000_000, 4000, 707_107},
		{1_000_000, 7999, 545_254},
		{1_000_000, hl, 500_000},
		{1_000_000, 2 * hl, 250_000},
		{1_000_000, 10 * hl, 976},
		{1_000_000, 63 * hl, 0},
		{maxInt64, hl, maxInt64 >> 1},
		{0, hl, 0},
		{-10, 1, 0},
	}
	for _, c := range cases {
		if got := Decay(c.points, c.dt, hl); got != c.want {
			t.Errorf("Decay(%d, %d) = %d, want %d", c.points, c.dt, got, c.want)
		}
	}
	if got := Decay(123, 10, 0); got != 123 {
		t.Errorf("zero half-life should not decay, got %d", got)
	}
}

func TestDecayHalfLifeExact(t *testing.T) {
	hl := DefaultParams().HalfLife
	for _, p := range []int64{1024, 100_000, 1 << 40} {
		for n := int64(0); n < 10; n++ {
			if got, want := Decay(p, n*hl, hl), p>>uint(n); got != want {
				t.Errorf("Decay(%d, %d half-lives) = %d, want %d", p, n, got, want)
			}
		}
	}
}

func TestDecayMonotonic(t *testing.T) {
	const hl = 3600
	for _, p := range []int64{1, 7, 1000, 99_999, 100_000, 1 << 50} {
		prev := Decay(p, 0, hl)
		for dt := int64(1); dt <= 5*hl; dt += 37 {
			cur := Decay(p, dt, hl)
			if cur > prev {
				t.Fatalf("Decay(%d) increased at dt=%d: %d > %d", p, dt, cur, prev)
			}
			prev = cur
		}
	}
	// Monotonic in points too.
	for p := int64(0); p < 2000; p += 3 {
		if Decay(p+3, 1234, hl) < Decay(p, 1234, hl) {
			t.Fatalf("Decay not monotonic in points at %d", p)
		}
	}
}

func TestBucketAccrueCap(t *testing.T) {
	p := DefaultParams()
	b := Bucket{}.Accrue(60*Milli, 100, p.HalfLife, p.DefaultCap)
	if b.Points != 60*Milli || b.LastTs != 100 {
		t.Fatalf("first accrue: %+v", b)
	}
	b = b.Accrue(60*Milli, 100, p.HalfLife, p.DefaultCap)
	if b.Points != p.DefaultCap {
		t.Fatalf("cap not applied: %d", b.Points)
	}
	// After one half-life the balance halves and can grow again.
	b = b.Accrue(10*Milli, 100+p.HalfLife, p.HalfLife, p.DefaultCap)
	if b.Points != 60*Milli {
		t.Fatalf("decay then accrue: got %d, want %d", b.Points, 60*Milli)
	}
	if got := b.At(100+2*p.HalfLife, p.HalfLife); got != 30*Milli {
		t.Fatalf("At after half-life: %d", got)
	}
	if got := (Bucket{Points: maxInt64}).Accrue(maxInt64, 0, 1, maxInt64); got.Points != maxInt64 {
		t.Fatalf("accrue overflow: %d", got.Points)
	}
}

func TestMultipliers(t *testing.T) {
	p := DefaultParams()
	day := int64(24 * 3600)
	maturity := []struct {
		first, now, want int64
	}{
		{0, 100, 500},
		{100, 50, 500},
		{100, 100, 500},
		{0 + day, day + 7*day/2, 750},
		{day, 8 * day, 1000},
		{day, 30 * day, 1000},
	}
	for _, c := range maturity {
		if got := Maturity(c.first, c.now, p); got != c.want {
			t.Errorf("Maturity(%d, %d) = %d, want %d", c.first, c.now, got, c.want)
		}
	}
	diversity := []struct {
		n    int
		want int64
	}{{0, 1000}, {1, 1000}, {2, 1150}, {3, 1300}, {5, 1600}, {9, 1600}}
	for _, c := range diversity {
		if got := Diversity(c.n, p); got != c.want {
			t.Errorf("Diversity(%d) = %d, want %d", c.n, got, c.want)
		}
	}
	if Identity(true, p) != 1200 || Identity(false, p) != 1000 {
		t.Error("identity multiplier")
	}
	// 100 points, named, fully mature, 3 categories: 100 * 1.2 * 1.3 = 156.
	if got := ToPoints(Composite(100*Milli, 1200, 1000, 1300)); got != 156 {
		t.Errorf("Composite = %d, want 156", got)
	}
	// New address: half weight.
	if got := ToPoints(Composite(100*Milli, 1000, 500, 1000)); got != 50 {
		t.Errorf("Composite immature = %d, want 50", got)
	}
	if got := Composite(maxInt64, 1200, 1000, 1600); got != maxInt64 {
		t.Errorf("Composite should saturate, got %d", got)
	}
	if got := Weighted(10*Milli, 1500); got != 15*Milli {
		t.Errorf("Weighted = %d", got)
	}
}

func TestTierOf(t *testing.T) {
	cases := []struct {
		score int64
		want  string
	}{
		{-1, Stranger}, {0, Stranger}, {9, Stranger}, {10, Regular}, {99, Regular},
		{100, Patron}, {499, Patron}, {500, Legend}, {maxInt64, Legend},
	}
	for _, c := range cases {
		if got := TierOf(c.score); got != c.want {
			t.Errorf("TierOf(%d) = %s, want %s", c.score, got, c.want)
		}
	}
}

func TestParamsValid(t *testing.T) {
	if !DefaultParams().Valid() {
		t.Fatal("default params must be valid")
	}
	bad := DefaultParams()
	bad.HalfLife = 0
	if bad.Valid() {
		t.Error("zero half-life accepted")
	}
	bad = DefaultParams()
	bad.DefaultWeight = bad.MaxWeight + 1
	if bad.Valid() {
		t.Error("weight above max accepted")
	}
}
