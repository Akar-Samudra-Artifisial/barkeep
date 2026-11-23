package townhall

import (
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/avl/v0"
)

func TestValidText(t *testing.T) {
	cases := []struct {
		s    string
		max  int
		want bool
	}{
		{"", 10, false},
		{"ok", 10, true},
		{"0123456789", 10, true},
		{"0123456789x", 10, false},
		{"tab\there", 20, false},
		{"caf\xc3\xa9", 20, false},
	}
	for _, c := range cases {
		if got := validText(c.s, c.max); got != c.want {
			t.Errorf("validText(%q, %d) = %v", c.s, c.max, got)
		}
	}
}

func TestKeyOrder(t *testing.T) {
	if key(9) >= key(10) || key(99) >= key(100) {
		t.Fatal("keys must sort numerically")
	}
}

func TestRenderPagination(t *testing.T) {
	for i := 0; i < 2*PageSize+3; i++ {
		id := nextID
		nextID++
		polls.Set(key(id), &poll{id: id, question: "Q" + strconv.Itoa(id), options: []string{"a", "b"}, votes: make([]int64, 2), voters: avl.NewTree()})
	}
	p1 := Render("")
	if !strings.Contains(p1, "Q23") || strings.Contains(p1, "Q13 ") || !strings.Contains(p1, "Page 1 of 3") {
		t.Fatalf("page 1: %s", p1)
	}
	if strings.Index(p1, "Q23") > strings.Index(p1, "Q14") {
		t.Fatal("page 1 must list newest first")
	}
	p3 := Render("?page=3")
	if !strings.Contains(p3, "Q1 ") || !strings.Contains(p3, "Q3 ") || strings.Contains(p3, "Q4 ") {
		t.Fatalf("page 3: %s", p3)
	}
	if Render("?page=99") != p3 {
		t.Fatal("out-of-range page should clamp to the last")
	}
	for _, bad := range []string{"poll/0", "poll/999", "poll/-1", "poll/abc", "nope"} {
		if !strings.HasPrefix(Render(bad), "# Not found") {
			t.Errorf("%q should be not found", bad)
		}
	}
	if VotesOf(1, 5) != -1 || VotesOf(999, 0) != -1 || HasVoted(999, address("g1x")) {
		t.Fatal("reads on unknown poll")
	}
}
