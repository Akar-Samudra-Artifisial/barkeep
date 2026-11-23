package lounge

import (
	"strconv"
	"strings"
	"testing"
)

func TestRingBuffer(t *testing.T) {
	for i := 1; i <= MaxEntries+5; i++ {
		add(entry{msg: "m" + strconv.Itoa(i), tier: "Regular", height: int64(i)})
	}
	if len(book) != MaxEntries || total != MaxEntries+5 {
		t.Fatalf("len %d total %d", len(book), total)
	}
	out := Render("")
	newest := strings.Index(out, "| m25 |")
	oldest := strings.Index(out, "| m6 |")
	if newest < 0 || oldest < 0 || newest > oldest {
		t.Fatalf("order wrong: newest %d oldest %d", newest, oldest)
	}
	if strings.Contains(out, "| m5 |") {
		t.Fatal("evicted entry still rendered")
	}
}

func TestRenderEscapes(t *testing.T) {
	book, next, total = nil, 0, 0
	add(entry{msg: "[x](javascript:y) | <b>", tier: "Regular"})
	out := Render("")
	if strings.Contains(out, "[x](") || strings.Contains(out, "<b>") || strings.Contains(out, " | <") {
		t.Fatalf("unescaped: %s", out)
	}
}
