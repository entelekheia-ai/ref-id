# SPDX-License-Identifier: Apache-2.0
# Grammar-level conformance: the declared expression, unadapted (pcre2 row), must decompose every parse vector as the JSON says.
#!/usr/bin/env perl
# Prove ref-id.json's grammar is engine-neutral: replay vectors.parse against
# Perl's regex engine, using the unadapted expression (pcre2 adaptation is empty).
use strict;
use warnings;
use JSON::PP qw(decode_json);

use FindBin qw($RealBin);
my $spec_path = "$RealBin/../ref-id.json";

open(my $fh, "<:raw", $spec_path) or die "cannot open $spec_path: $!";
local $/;
my $raw = <$fh>;
close($fh);
my $spec = decode_json($raw);

my $expr = $spec->{grammar}{expression};
# pcre2 adaptation's replace list is empty -- expression used unadapted.
for my $pair (@{ $spec->{grammar}{adaptations}{pcre2}{replace} }) {
    my ($old, $new) = @$pair;
    $expr =~ s/\Q$old\E/$new/g;
}

my $rx = qr/$expr/;

sub split_pairs {
    my ($text, $sep) = @_;
    my @pairs;
    for my $piece (split(/\Q$sep\E/, $text, -1)) {
        if ($piece =~ /=/) {
            my ($k, $v) = split(/=/, $piece, 2);
            push @pairs, [$k, $v];
        } else {
            push @pairs, [$piece, undef];
        }
    }
    return \@pairs;
}

sub pairs_equal {
    my ($a, $b) = @_;
    return 0 unless ref($a) eq 'ARRAY' && ref($b) eq 'ARRAY';
    return 0 unless scalar(@$a) == scalar(@$b);
    for my $i (0 .. $#$a) {
        my ($ak, $av) = @{ $a->[$i] };
        my ($bk, $bv) = @{ $b->[$i] };
        return 0 unless defined($ak) == defined($bk) && (!defined($ak) || $ak eq $bk);
        return 0 unless defined($av) == defined($bv) && (!defined($av) || $av eq $bv);
    }
    return 1;
}

my $vectors = $spec->{vectors}{parse};
my $total = scalar(@$vectors);
my $agreed = 0;
my @disagreements;

for my $vec (@$vectors) {
    my $input = $vec->{input};
    my $expect = $vec->{expect};
    my $status = $expect->{status};
    my $part = $expect->{part};

    my ($ok, $reason) = (1, "");

    if (defined($status) && $status eq 'malformed' && defined($part) && $part eq 'grammar') {
        if ($input =~ $rx) {
            ($ok, $reason) = (0, "expected no match (malformed/grammar) but it matched");
        }
    } else {
        if ($input !~ $rx) {
            ($ok, $reason) = (0, "expected a match but got none");
        } else {
            my %g = %+; # named captures

            if (exists $expect->{version}) {
                my $raw_v = $g{version};
                my $version = (defined($raw_v) && $raw_v ne '') ? int($raw_v) : $spec->{version}{default};
                if ($version != $expect->{version}) {
                    ($ok, $reason) = (0, "version $version != expect $expect->{version}");
                }
            }

            if ($ok && exists $expect->{type}) {
                my $t = $g{type};
                $t = '' unless defined $t;
                if ($t ne $expect->{type}) {
                    ($ok, $reason) = (0, "type '$t' != expect '$expect->{type}'");
                }
            }

            if ($ok && exists $expect->{locator}) {
                my $l = $g{locator};
                $l = '' unless defined $l;
                if ($l ne $expect->{locator}) {
                    ($ok, $reason) = (0, "locator '$l' != expect '$expect->{locator}'");
                }
            }

            if ($ok && exists $expect->{qualifiers}) {
                my $sep = $spec->{grammar}{state}{separator};
                my $state_group = $g{state};
                my $actual_pairs = (defined($state_group) && $state_group ne '')
                    ? split_pairs($state_group, $sep)
                    : [];
                unless (pairs_equal($actual_pairs, $expect->{qualifiers})) {
                    ($ok, $reason) = (0, "qualifiers mismatch");
                }
            }

            if ($ok && exists($expect->{fragment}) && defined($expect->{fragment})) {
                my $fsep = $spec->{grammar}{fragment}{separator};
                my $frag_group = $g{fragment};
                if (!defined($frag_group)) {
                    ($ok, $reason) = (0, "expected a fragment group but none captured");
                } else {
                    my @pieces = split(/\Q$fsep\E/, $frag_group, -1);
                    my $path = shift @pieces;
                    my $refinements = @pieces ? split_pairs(join($fsep, @pieces), $fsep) : [];
                    my $exp_frag = $expect->{fragment};
                    if ($path ne $exp_frag->{path}) {
                        ($ok, $reason) = (0, "fragment.path '$path' != expect '$exp_frag->{path}'");
                    } elsif (!pairs_equal($refinements, $exp_frag->{refinements} // [])) {
                        ($ok, $reason) = (0, "fragment.refinements mismatch");
                    }
                }
            }
        }
    }

    if ($ok) {
        $agreed++;
    } else {
        push @disagreements, [$vec->{name}, $reason];
    }
}

print "perl (pcre2-unadapted): $agreed/$total agreed\n";
for my $d (@disagreements) {
    print "  DISAGREE: $d->[0] -- $d->[1]\n";
}

exit(@disagreements ? 1 : 0);
