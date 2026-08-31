UPDATE public.fantasy_club_transfers
SET player_name = 'Will Haselhurst',
    note = 'Academy midfielder signed a professional contract'
WHERE id = 'eca0b492-ba93-4dcb-82d8-7e845f984c0f';

INSERT INTO public.fantasy_club_transfers (player_name, direction, other_club, fee, window_label, transfer_date, note)
SELECT 'Rokas Pukstas', 'in', 'Hajduk Split', '£4.3m', '2026/27 summer', DATE '2026-08-29',
       'Permanent signing — midfielder from Hajduk Split'
WHERE NOT EXISTS (
  SELECT 1 FROM public.fantasy_club_transfers WHERE player_name = 'Rokas Pukstas' AND direction = 'in'
);