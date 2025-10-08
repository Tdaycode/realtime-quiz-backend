import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateLobbyDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(20)
  username: string;
}

export class JoinLobbyDto {
  @IsString()
  @IsNotEmpty()
  lobbyId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(20)
  username: string;
}

export class SubmitAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsNotEmpty()
  selectedOption: number;
}
