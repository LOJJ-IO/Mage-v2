from app.services.social_shortcuts import is_standalone_thanks


def test_standalone_thanks_phrases():
    assert is_standalone_thanks("thanks")
    assert is_standalone_thanks("Thanks!")
    assert is_standalone_thanks("thank you")
    assert is_standalone_thanks("thanks for your help")


def test_embedded_thanks_not_standalone():
    assert not is_standalone_thanks("thanks, can I get extra towels")
    assert not is_standalone_thanks("I'd like a sprite thanks")
    assert not is_standalone_thanks("thanksgiving dinner at the restaurant")
