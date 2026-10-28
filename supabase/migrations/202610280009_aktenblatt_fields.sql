-- SDN v0.21 / AKTENBLATT – nach v0.17 ausführen.
-- Bestehende Datensätze bleiben unverändert. Die neuen Felder liegen im JSONB der Akte.
-- Erlaubt der gesicherten Ticketfunktion, Race/Skillmatrix/Ausrüstung zu übernehmen.
-- Keine neuen Tabellen oder Berechtigungen für Spieler.

create or replace function public.sdn_field_path(k text) returns text[]
language plpgsql immutable set search_path = '' as $$
begin
 if k = any(array['hair','eyes','build','skin','distinguishing','description','impression']) then
  return array['appearance',k];
 elsif k = any(array['character','motivation','behavior','assessment','likes','dislikes']) then
  return array['personality',k];
 elsif k = any(array['background','criminalRecord','formerAffiliations','medicalConditions',
                     'medicalInjuries','medicalTreatments','medicalAllergies','medicalNotes']) then
  return array['history',k];
 elsif k = any(array['hasCover','coverName','coverDetails','notes']) then
  return array['secret',k];
 elsif k = any(array['name','alias','sdnId','role','hasSecretIdentity','height','weight','age','sex','blood',
                     'birthplace','birthday','player','discordChannelUrl','classCode','personalNotes','powerName',
                     'raceType','raceName','raceOrigin','raceFeatures','skillNotes','equipmentItems','costumeDescription',
                     'received','origin','powerDescription','weaknesses','generalWeaknesses','generalStrengths','generalAbilities']) then
  return array[k];
 else
  raise exception 'Unzulässiges Aktenfeld: %', k;
 end if;
end; $$;
